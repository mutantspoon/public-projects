/**
 * Quill AI Workflow Test Harness
 *
 * Simulates the full app pipeline end-to-end:
 *   anchor context → AI call → JSON parse/repair → sequential apply → conflict detection
 *
 * Run:  node test-workflow.mjs
 * Model: MODEL=gemini-2.0-flash node test-workflow.mjs
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

const settings = JSON.parse(readFileSync(join(homedir(), 'Library', 'Application Support', 'Quill', 'settings.json'), 'utf8'));
const API_KEY = settings.gemini_api_key;
const MODEL   = process.env.MODEL || 'gemini-3-flash-preview';

// ─── App Logic (mirrors comments.js exactly) ─────────────────────────────────

function applyFindReplace(doc, find, replace) {
    if (!find) return doc.trimEnd() + (replace ? '\n\n' + replace : '');
    const idx = doc.indexOf(find);
    if (idx === -1) return doc; // no-op — text not found
    return doc.slice(0, idx) + replace + doc.slice(idx + find.length);
}

function buildProposedDoc(original, changes) {
    let doc = original;
    const results = changes.map(c => {
        const before = doc;
        doc = applyFindReplace(doc, c.find, c.replace);
        const applied = c.find ? doc !== before : true;
        return { ...c, applied };
    });
    return { finalDoc: doc, results };
}

function parseJsonResponse(text) {
    const start = text.indexOf('[');
    const end   = text.lastIndexOf(']');
    if (start !== -1 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
    }
    if (start !== -1) {
        const chunk = text.slice(start);
        const afterLastObj = chunk.lastIndexOf('},');
        if (afterLastObj !== -1) {
            try { return JSON.parse(chunk.slice(0, afterLastObj + 1) + ']'); } catch (e) {}
        }
        const lastBrace = chunk.lastIndexOf('}');
        if (lastBrace !== -1) {
            try { return JSON.parse(chunk.slice(0, lastBrace + 1) + ']'); } catch (e) {}
        }
    }
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    return JSON.parse(cleaned);
}

function buildSystemPrompt() {
    return `You are a writing assistant for Markdown documents.
Apply each revision instruction by returning find-and-replace operations. One object per change.
Return ONLY a JSON array, no explanation:
[{"comment":"instruction text","find":"exact text to replace","replace":"replacement"}]
Rules:
- "find" must be verbatim text from the document
- One object per change — spell fixes, list items, and table rows each get their own object
- For insertions use "find":""
- When a comment has a [section: "..."] tag, apply the instruction to ALL content in that section — not just the heading`;
}

function buildUserMessage(doc, comments) {
    const commentList = comments.map((c, i) => {
        const anchor = c.anchor ? ` [section: "${c.anchor.slice(0, 300)}"]` : '';
        return `${i + 1}.${anchor} ${c.note}`;
    }).join('\n');
    return `Document:\n\n${doc}\n\nRevision instructions:\n${commentList}`;
}

async function callGemini(systemPrompt, userMessage) {
    const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: userMessage }] }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                generationConfig: { maxOutputTokens: 16384, temperature: 0 },
            }),
        }
    );
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err?.error?.message || `HTTP ${r.status}`);
    }
    const data = await r.json();
    return {
        text:         data?.candidates?.[0]?.content?.parts?.[0]?.text ?? null,
        finishReason: data?.candidates?.[0]?.finishReason,
        tokenCount:   data?.usageMetadata?.candidatesTokenCount ?? '?',
    };
}

// ─── Conflict Detection ───────────────────────────────────────────────────────

function findConflicts(changes) {
    const conflicts = [];
    for (let i = 0; i < changes.length; i++) {
        for (let j = i + 1; j < changes.length; j++) {
            const a = changes[i].find, b = changes[j].find;
            if (!a || !b) continue;
            if (a.includes(b) || b.includes(a)) {
                conflicts.push({ i, j, a: a.slice(0, 40), b: b.slice(0, 40) });
            }
        }
    }
    return conflicts;
}

// ─── Test Scenarios ───────────────────────────────────────────────────────────

const SCENARIOS = [
    {
        name: 'Multi-comment: spelling + list extend + style',
        doc: `# Project Notes

## Marvel Heroes

A list of Marvel Heroesss

* Iron Man

* Hulk

## Scene Description

a blue box on a green hill

## Summary

This project is very very good and we are happy with it.`,
        comments: [
            {
                note: 'Fix the typo in the heading',
                anchor: 'A list of Marvel Heroesss\n\n* Iron Man\n\n* Hulk',
            },
            {
                note: 'Extend this to 5 heroes',
                anchor: 'A list of Marvel Heroesss\n\n* Iron Man\n\n* Hulk',
            },
            {
                note: 'Make this more descriptive and vivid',
                anchor: 'a blue box on a green hill',
            },
        ],
        validate(results, finalDoc, original) {
            const issues = [];
            const failed = results.filter(r => r.find && !r.applied);
            if (failed.length > 0) {
                issues.push(`${failed.length} change(s) failed to apply (find not in doc after prior changes):`);
                failed.forEach(f => issues.push(`  find: "${f.find.slice(0, 60)}"`));
            }
            if (finalDoc === original) issues.push('Document unchanged');
            return issues;
        }
    },
    {
        name: 'Multi-comment: two independent edits on different sections',
        doc: `# Introduction

The quik brown fox jumpd over the lazy dog.

# Steps

1. Do the thing
2. Do the other thing
3. Finish up`,
        comments: [
            {
                note: 'Fix spelling errors',
                anchor: 'The quik brown fox jumpd over the lazy dog.',
            },
            {
                note: 'Convert numbered list to bullets',
                anchor: '1. Do the thing\n2. Do the other thing\n3. Finish up',
            },
        ],
        validate(results, finalDoc) {
            const issues = [];
            const failed = results.filter(r => r.find && !r.applied);
            if (failed.length > 0) {
                issues.push(`${failed.length} change(s) failed to apply:`);
                failed.forEach(f => issues.push(`  find: "${f.find.slice(0, 60)}"`));
            }
            if (finalDoc.includes('quik')) issues.push('Spelling not fixed: "quik"');
            if (finalDoc.includes('jumpd')) issues.push('Spelling not fixed: "jumpd"');
            if (finalDoc.includes('1. Do the thing')) issues.push('List not converted to bullets');
            return issues;
        }
    },
    {
        name: 'Single comment producing many changes (10-item list swap)',
        doc: `# Roster

* Spider-Man
* Iron Man
* Captain America
* Thor
* Black Widow
* Hulk
* Hawkeye
* Doctor Strange
* Black Panther
* Ant-Man`,
        comments: [
            {
                note: 'Change all heroes to villains',
                anchor: '* Spider-Man\n* Iron Man\n* Captain America\n* Thor\n* Black Widow\n* Hulk\n* Hawkeye\n* Doctor Strange\n* Black Panther\n* Ant-Man',
            },
        ],
        validate(results, finalDoc) {
            const issues = [];
            const failed = results.filter(r => r.find && !r.applied);
            if (failed.length > 0) {
                issues.push(`${failed.length}/${results.length} changes failed to apply:`);
                failed.forEach(f => issues.push(`  find: "${f.find.slice(0, 50)}" → "${f.replace.slice(0, 50)}"`));
            }
            const heroesLeft = ['Spider-Man','Iron Man','Captain America','Thor','Black Widow','Hulk','Hawkeye','Doctor Strange','Black Panther','Ant-Man'].filter(h => finalDoc.includes(h));
            if (heroesLeft.length > 0) issues.push(`Heroes not replaced: ${heroesLeft.join(', ')}`);
            return issues;
        }
    },
];

// ─── Run ──────────────────────────────────────────────────────────────────────

const SYS = buildSystemPrompt();
let totalPass = 0, totalFail = 0;

console.log('='.repeat(70));
console.log(`Quill Workflow Test — ${MODEL}`);
console.log('Tests the full pipeline: anchor context → AI → parse → apply → validate');
console.log('='.repeat(70));

for (const scenario of SCENARIOS) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`SCENARIO: ${scenario.name}`);
    console.log(`Comments (${scenario.comments.length}):`);
    scenario.comments.forEach((c, i) => console.log(`  ${i+1}. "${c.note}"`));

    // Call AI
    const userMsg = buildUserMessage(scenario.doc, scenario.comments);
    let raw, finishReason, tokenCount;
    try {
        ({ text: raw, finishReason, tokenCount } = await callGemini(SYS, userMsg));
    } catch (e) {
        console.log(`\n  ✗ API error: ${e.message}`);
        totalFail++;
        continue;
    }

    console.log(`\nAI response: ${raw?.length ?? 0} chars, ${tokenCount} tokens, finishReason: ${finishReason}`);
    if (finishReason !== 'STOP') {
        console.log(`  ⚠ Response may be truncated (finishReason: ${finishReason})`);
    }

    // Parse
    let changes;
    try {
        changes = parseJsonResponse(raw);
        console.log(`Parsed: ${changes.length} change(s) across ${scenario.comments.length} comment(s)`);

        // Show change breakdown
        const byComment = {};
        changes.forEach(c => {
            const key = c.comment?.slice(0, 50) || '(unknown)';
            byComment[key] = (byComment[key] || 0) + 1;
        });
        Object.entries(byComment).forEach(([k, v]) => console.log(`  "${k}": ${v} op(s)`));
    } catch (e) {
        console.log(`  ✗ JSON parse failed: ${e.message}`);
        console.log(`  Raw (200 chars): ${raw?.slice(0, 200)}`);
        totalFail++;
        continue;
    }

    // Check for conflicts
    const conflicts = findConflicts(changes);
    if (conflicts.length > 0) {
        console.log(`\n⚠ ${conflicts.length} overlapping find string(s) — later changes may be no-ops:`);
        conflicts.forEach(c => console.log(`  [${c.i+1}] "${c.a}" overlaps [${c.j+1}] "${c.b}"`));
    }

    // Validate all finds exist in original
    const missingFinds = changes.filter(c => c.find && !scenario.doc.includes(c.find));
    if (missingFinds.length > 0) {
        console.log(`\n⚠ ${missingFinds.length} find string(s) not in original doc:`);
        missingFinds.forEach(c => console.log(`  "${c.find.slice(0, 60)}"`));
    }

    // Apply sequentially
    const { finalDoc, results } = buildProposedDoc(scenario.doc, changes);
    const applied = results.filter(r => r.applied).length;
    const noops   = results.filter(r => r.find && !r.applied).length;
    console.log(`\nApply: ${applied}/${changes.length} applied, ${noops} no-ops (silent failures)`);

    // Show no-ops
    if (noops > 0) {
        console.log('No-op details:');
        results.filter(r => r.find && !r.applied).forEach(r => {
            console.log(`  find: "${r.find.slice(0, 60)}" → "${r.replace.slice(0, 40)}"`);
        });
    }

    // Show final doc
    console.log('\nFinal document:');
    console.log(finalDoc.split('\n').map(l => '  ' + l).join('\n'));

    // Run validator
    const issues = scenario.validate(results, finalDoc, scenario.doc);
    console.log('');
    if (issues.length === 0) {
        console.log('✓ PASS');
        totalPass++;
    } else {
        console.log(`✗ FAIL:`);
        issues.forEach(i => console.log(`  ${i}`));
        totalFail++;
    }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`Results: ${totalPass}/${SCENARIOS.length} passed, ${totalFail} failed`);
console.log('='.repeat(70));
process.exit(totalFail > 0 ? 1 : 0);
