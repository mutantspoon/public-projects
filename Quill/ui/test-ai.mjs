/**
 * Gemini API prompt tester for Quill comment-apply feature.
 * Run: node test-ai.mjs
 * Covers the real use cases: grammar, spelling, style, rewrites, additions,
 * technical docs, list transforms — the full range of a writing tool.
 */

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ─── Load API keys ────────────────────────────────────────────────────────────

const settingsPath = join(homedir(), 'Library', 'Application Support', 'Quill', 'settings.json');
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));
const GEMINI_KEY    = settings.gemini_api_key;
const ANTHROPIC_KEY = settings.llm_api_key;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeQuotes(t) {
    return t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
}

function applyChanges(doc, changes) {
    let result = doc;
    for (const c of changes) {
        if (!c.find) {
            result = result.trimEnd() + (c.replace ? '\n\n' + c.replace : '');
        } else {
            let idx = result.indexOf(c.find);
            if (idx === -1) {
                // Fallback: normalize smart quotes (mirrors app's applyFindReplace)
                const normResult = normalizeQuotes(result);
                const normFind = normalizeQuotes(c.find);
                idx = normResult.indexOf(normFind);
                if (idx !== -1) {
                    result = result.slice(0, idx) + c.replace + result.slice(idx + normFind.length);
                }
            } else {
                result = result.slice(0, idx) + c.replace + result.slice(idx + c.find.length);
            }
        }
    }
    return result;
}

// ─── Test Cases ───────────────────────────────────────────────────────────────

const TESTS = [
    // ── Grammar & Spelling ────────────────────────────────────────────────────
    {
        name: 'Fix spelling errors',
        doc: `# Project Update

The deployement went smoothly.
The application is now runing as expected.
All tests have been validated in the new enviroment.
Performence metrics look good so far.`,
        comments: ['Fix all the spelling errors'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            const badWords = ['deployement', 'runing', 'enviroment', 'Performence'];
            const remaining = badWords.filter(w => result.includes(w));
            if (remaining.length > 0) return `Still has misspellings: ${remaining.join(', ')}`;
            // All finds must exist in original doc
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            return null;
        }
    },
    {
        name: 'Fix grammar in a sentence',
        doc: `# Meeting Notes

The team have decided to pushed the release to next week.
Everyone are excited about the new features.`,
        comments: ['Fix the grammar in this document'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            // Result should not still have obvious grammar errors
            if (result.includes('have decided to pushed')) return 'Grammar error not fixed: "have decided to pushed"';
            return null;
        }
    },

    // ── Style & Tone ──────────────────────────────────────────────────────────
    {
        name: 'Make more formal',
        doc: `# Client Email

Hey! So we looked at your stuff and basically the whole thing needs a redo.
The code is kinda a mess and we gotta fix like a ton of bugs before launch.
Let us know what you think!`,
        comments: ['Rewrite this to sound more professional and formal'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            // Should not still contain very informal words
            const informalWords = ['Hey!', 'basically', 'kinda', 'gotta', 'like a ton', 'stuff'];
            const stillInformal = informalWords.filter(w => result.includes(w));
            if (stillInformal.length > 2) return `Still too informal: ${stillInformal.join(', ')}`;
            return null;
        }
    },
    {
        name: 'Make more concise',
        doc: `# Summary

In this particular section of the document, we are going to be talking about and discussing
the various different ways in which you can go about setting up and configuring the system
in order to make it work properly for your specific use case and situation.`,
        comments: ['Make this more concise — cut the filler words'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            const resultWordCount = result.split(/\s+/).length;
            const origWordCount = doc.split(/\s+/).length;
            if (resultWordCount >= origWordCount) return `Not made shorter: ${resultWordCount} words vs original ${origWordCount}`;
            return null;
        }
    },

    // ── Content Addition ──────────────────────────────────────────────────────
    {
        name: 'Add a section',
        doc: `# API Documentation

## Authentication

All requests require a Bearer token in the Authorization header.

## Endpoints

### GET /users
Returns a list of all users.`,
        comments: ['Add a "Rate Limits" section after the Endpoints section explaining we allow 100 requests per minute'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            if (!result.toLowerCase().includes('rate limit')) return 'Result has no "Rate Limits" section';
            if (!result.includes('100')) return 'Result does not mention 100 requests';
            return null;
        }
    },
    {
        name: 'Expand a short point',
        doc: `# Onboarding Guide

## Step 1: Install dependencies
Run npm install.

## Step 2: Configure environment
Copy .env.example to .env and fill in the values.

## Step 3: Start the server
Run npm start.`,
        comments: ['Expand Step 2 with more detail about what each env variable does'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            const step2Before = doc.split('## Step 3')[0].split('## Step 2')[1] || '';
            const step2After = result.split('## Step 3')[0].split('## Step 2')[1] || '';
            if (step2After.length <= step2Before.length) return 'Step 2 was not expanded';
            return null;
        }
    },

    // ── Technical / CLAUDE.md style ───────────────────────────────────────────
    {
        name: 'Update a code example',
        doc: `# Claude Code Guide

## Running the agent

To start the agent, use:

\`\`\`bash
claude --model claude-2 --prompt "your task here"
\`\`\`

This will launch the default model.`,
        comments: ['Update the model name from claude-2 to claude-sonnet-4-6'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (result.includes('claude-2')) return 'Old model name still present';
            if (!result.includes('claude-sonnet-4-6')) return 'New model name not in result';
            return null;
        }
    },

    // ── Anchor context (the real bug: comment on heading but intent is the list) ─
    {
        name: 'Comment on heading → change the list (anchor context)',
        doc: `# A list of Marvel Heroes

- Spider-Man
- Iron Man
- Captain America
- Thor
- Black Widow`,
        // Simulate what the app now sends: anchor text included in the instruction
        comments: ['[this comment is anchored to this section of the document: "A list of Marvel Heroes\nSpider-Man\nIron Man\nCaptain America\nThor\nBlack Widow"] change to villains'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            // List items should be villains now
            const heroNames = ['Spider-Man', 'Iron Man', 'Captain America', 'Thor', 'Black Widow'];
            const heroesLeft = heroNames.filter(h => result.includes(h));
            if (heroesLeft.length > 0) return `Heroes not replaced: ${heroesLeft.join(', ')}`;
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            return null;
        }
    },

    // ── List Transforms ───────────────────────────────────────────────────────
    {
        name: 'Hero → Villain (10 items)',
        doc: `# Marvel Characters

- Spider-Man
- Iron Man
- Captain America
- Thor
- Black Widow
- Hulk
- Hawkeye
- Doctor Strange
- Black Panther
- Ant-Man`,
        comments: ['Change all the heroes to Marvel villains'],
        validate(changes, doc) {
            if (changes.length < 5) return `Only ${changes.length} changes — expected ~10`;
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            return null;
        }
    },
    {
        name: 'Reduce list from 10 to 5',
        doc: `# Shopping List

- Apples
- Bananas
- Carrots
- Dates
- Eggs
- Flour
- Grapes
- Honey
- Iceberg lettuce
- Jam`,
        comments: ['Cut this list down to just 5 items, keep the first 5'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            const lines = result.split('\n').filter(l => l.trim().startsWith('-'));
            if (lines.length !== 5) return `Got ${lines.length} items after applying, expected 5`;
            return null;
        }
    },

    // ── Tables ────────────────────────────────────────────────────────────────
    {
        name: 'Add a row to a markdown table',
        doc: `# Keyboard Shortcuts

| Action | macOS | Windows |
|--------|-------|---------|
| Save | Cmd+S | Ctrl+S |
| Open | Cmd+O | Ctrl+O |
| New | Cmd+N | Ctrl+N |`,
        comments: ['Add a row for "Find" (Cmd+F on macOS, Ctrl+F on Windows)'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (!result.includes('Find')) return 'New "Find" row not added';
            if (!result.includes('Cmd+F')) return '"Cmd+F" not in result';
            if (!result.includes('Ctrl+F')) return '"Ctrl+F" not in result';
            const rows = result.split('\n').filter(l => l.trim().startsWith('|') && !l.includes('---'));
            if (rows.length < 5) return `Expected 5 table rows (header + 4 data), got ${rows.length}`;
            return null;
        }
    },
    {
        name: 'Update a value in a table',
        doc: `# Settings

| Setting | Default | Description |
|---------|---------|-------------|
| font_size | 14 | Editor font size in pixels |
| word_wrap | true | Wrap long lines |
| theme | light | UI color theme |`,
        comments: ['Change the default font_size from 14 to 16'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (result.includes('| 14 |')) return 'Old value "14" still in table';
            if (!result.includes('16')) return 'New value "16" not in result';
            return null;
        }
    },

    // ── Nested Lists ──────────────────────────────────────────────────────────
    {
        name: 'Edit nested list items',
        doc: `# Project Structure

- Frontend
  - React components
  - CSS modules
- Backend
  - Express routes
  - Database models
- Testing
  - Unit tests
  - Integration tests`,
        comments: ['Change "React components" to "Vue components" and "Express routes" to "FastAPI routes"'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (result.includes('React components')) return '"React components" not replaced';
            if (result.includes('Express routes')) return '"Express routes" not replaced';
            if (!result.includes('Vue components')) return '"Vue components" not in result';
            if (!result.includes('FastAPI routes')) return '"FastAPI routes" not in result';
            return null;
        }
    },

    // ── Checklists ────────────────────────────────────────────────────────────
    {
        name: 'Mark checklist items as done',
        doc: `# Release Checklist

- [x] Write unit tests
- [ ] Update changelog
- [ ] Tag release in git
- [ ] Deploy to staging
- [ ] Notify team`,
        comments: ['Mark "Update changelog" and "Tag release in git" as done'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (result.includes('- [ ] Update changelog')) return '"Update changelog" not marked done';
            if (result.includes('- [ ] Tag release in git')) return '"Tag release in git" not marked done';
            if (!result.includes('- [x] Update changelog')) return '"Update changelog" not marked [x]';
            if (!result.includes('- [x] Tag release in git')) return '"Tag release in git" not marked [x]';
            return null;
        }
    },

    // ── Numbered List ─────────────────────────────────────────────────────────
    {
        name: 'Convert numbered list to bullets',
        doc: `# Setup Steps

1. Install dependencies
2. Copy .env.example to .env
3. Run the database migrations
4. Start the dev server`,
        comments: ['Convert this numbered list to bullet points'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (/^\d+\./m.test(result)) return 'Numbered items still present in result';
            const bullets = result.split('\n').filter(l => l.trim().startsWith('-') || l.trim().startsWith('*'));
            if (bullets.length < 4) return `Expected 4 bullet items, got ${bullets.length}`;
            return null;
        }
    },

    // ── Code Block Preservation ───────────────────────────────────────────────
    {
        name: 'Edit prose without touching code block',
        doc: `# Deployment Guide

Before deploying, make shure you have set the environment variables.

\`\`\`bash
export NODE_ENV=production
export PORT=3000
npm run build
\`\`\`

After the build completes, upload the dist/ folder to your server.`,
        comments: ['Fix the spelling error in the prose (do not touch the code block)'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (result.includes('shure')) return 'Spelling error "shure" not fixed';
            // Code block must be untouched
            if (!result.includes('export NODE_ENV=production')) return 'Code block was modified';
            if (!result.includes('export PORT=3000')) return 'Code block was modified';
            if (!result.includes('npm run build')) return 'Code block was modified';
            return null;
        }
    },

    // ── Inline Code ───────────────────────────────────────────────────────────
    {
        name: 'Edit prose containing inline code',
        doc: `# Getting Started

To install the package, run \`npm install\` in your terminal.
Then copy the config file with \`cp config.example.js config.js\`.
Finally, start the app using \`npm start\`.`,
        comments: ['Change all npm commands to use yarn instead (npm install → yarn install, npm start → yarn start)'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            if (result.includes('`npm install`')) return '`npm install` not replaced';
            if (result.includes('`npm start`')) return '`npm start` not replaced';
            if (!result.includes('yarn')) return 'No yarn commands in result';
            return null;
        }
    },

    // ── Smart punctuation (regression: Anthropic normalizes curly quotes to ASCII) ──
    {
        name: 'Rewrite rambly text with smart apostrophe (test3.md)',
        // U+2019 right single quotation mark in "i\u2019m" — Milkdown outputs this
        // when rendering markdown. Anthropic normalizes it to ASCII ' in find strings,
        // which previously caused a silent no-op. This test catches that regression.
        doc: `I want to build a dog house, that is red with a roof, actually, i already have a small shed, maybe that should be converted to a dog house? i\u2019m not sure\u2026. should we go just buy a dog house? hard to tell actually. Hmmmm yeah my friend actually has a dog house for sale, we should just do that.`,
        comments: ['make this less rambly'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            for (const c of changes) {
                if (c.find && !doc.includes(c.find) && !normalizeQuotes(doc).includes(normalizeQuotes(c.find))) {
                    return `"find" not in doc: "${c.find}"`;
                }
            }
            const result = applyChanges(doc, changes);
            if (result === doc) return 'Document unchanged';
            return null;
        }
    },

    // ── Creative Writing ──────────────────────────────────────────────────────
    {
        name: 'Change tone to dramatic',
        doc: `# Story Opening

John walked into the office. He sat down at his desk. He opened his laptop.
It was Tuesday. He had a meeting at 3pm.`,
        comments: ['Rewrite this to be more dramatic and vivid'],
        validate(changes, doc) {
            if (changes.length === 0) return 'No changes returned';
            const result = applyChanges(doc, changes);
            for (const c of changes) {
                if (c.find && !doc.includes(c.find)) return `"find" not in doc: "${c.find}"`;
            }
            // Result should be longer (more vivid = more words) or at least different
            if (result === doc) return 'Document unchanged';
            return null;
        }
    },
];

// ─── Prompt ───────────────────────────────────────────────────────────────────

function buildSystemPrompt() {
    return `You are a writing assistant for Markdown documents.
Apply each revision instruction by returning find-and-replace operations. One object per change.
Return ONLY a JSON array, no explanation:
[{"comment":"instruction text","find":"exact text to replace","replace":"replacement"}]
Rules:
- "find" must be verbatim text present in the original document
- Grammar/spelling: if a single sentence has multiple errors, fix the whole sentence in one operation — do not split it into chained ops where a later "find" only exists after a prior replacement
- List items and table rows: one operation per item, even within the same section
- For list item deletions, include the preceding newline in "find" (e.g. "\\n- Item") not a trailing newline — this ensures the last item in a list deletes cleanly
- For insertions use "find":""
- When a comment has a [section: "..."] tag, apply the instruction to every item in that section individually — not just the heading`;
}

function buildUserMessage(doc, comments) {
    const commentList = comments.map((c, i) => `${i + 1}. ${c}`).join('\n');
    return `Document:\n\n${doc}\n\nRevision instructions:\n${commentList}`;
}

// ─── API call ─────────────────────────────────────────────────────────────────

// Shortcuts: haiku → claude-haiku-4-5-20251001, sonnet → claude-sonnet-4-6
const MODEL_ALIASES = {
    haiku:  'claude-haiku-4-5-20251001',
    sonnet: 'claude-sonnet-4-6',
};
const RAW_MODEL = process.env.MODEL || 'gemini-2.5-flash';
const MODEL = MODEL_ALIASES[RAW_MODEL] || RAW_MODEL;
const IS_ANTHROPIC = MODEL.startsWith('claude-');

async function callLlm(systemPrompt, userMessage) {
    if (IS_ANTHROPIC) {
        if (!ANTHROPIC_KEY) throw new Error('No llm_api_key in settings.json');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: MODEL,
                max_tokens: 8192,
                temperature: 0,
                system: systemPrompt,
                messages: [{ role: 'user', content: userMessage }],
            }),
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`API error ${response.status}: ${err?.error?.message || JSON.stringify(err)}`);
        }
        const data = await response.json();
        return {
            text: data?.content?.[0]?.text ?? null,
            finishReason: data?.stop_reason === 'end_turn' ? 'STOP' : data?.stop_reason,
        };
    } else {
        if (!GEMINI_KEY) throw new Error('No gemini_api_key in settings.json');
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_KEY}`,
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
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(`API error ${response.status}: ${JSON.stringify(err)}`);
        }
        const data = await response.json();
        const candidate = data?.candidates?.[0];
        return {
            text: candidate?.content?.parts?.[0]?.text ?? null,
            finishReason: candidate?.finishReason,
        };
    }
}

function parseJson(text) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
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

// ─── Run ──────────────────────────────────────────────────────────────────────

const systemPrompt = buildSystemPrompt();
let passed = 0;
let failed = 0;
const failures = [];

console.log('='.repeat(60));
console.log(`Quill AI Prompt Tester — ${MODEL}${RAW_MODEL !== MODEL ? ` (${RAW_MODEL})` : ''}`);
console.log(`${TESTS.length} tests across: spelling, grammar, style, additions, technical, tables, lists, checklists, code, creative`);
console.log('='.repeat(60));
console.log();

const totalStart = Date.now();
const times = [];

for (const test of TESTS) {
    process.stdout.write(`▶ ${test.name} ... `);
    const userMessage = buildUserMessage(test.doc, test.comments);

    let raw, finishReason;
    const t0 = Date.now();
    try {
        ({ text: raw, finishReason } = await callLlm(systemPrompt, userMessage));
    } catch (e) {
        console.log(`✗ API error: ${e.message}`);
        failed++;
        failures.push({ name: test.name, reason: `API error: ${e.message}` });
        continue;
    }

    if (finishReason !== 'STOP') {
        console.log(`✗ Bad finishReason: ${finishReason}`);
        failed++;
        failures.push({ name: test.name, reason: `finishReason: ${finishReason}`, raw });
        continue;
    }

    let changes;
    try {
        changes = parseJson(raw);
    } catch (e) {
        console.log(`✗ JSON parse failed: ${e.message}`);
        console.log('  Raw:', raw?.slice(0, 200));
        failed++;
        failures.push({ name: test.name, reason: `JSON parse failed`, raw });
        continue;
    }

    const elapsed = Date.now() - t0;
    times.push(elapsed);
    const err = test.validate(changes, test.doc);
    if (err) {
        console.log(`✗ ${err}  [${elapsed}ms]`);
        console.log(`  (${changes.length} changes returned)`);
        changes.forEach((c, i) => {
            const f = c.find ? `"${c.find.slice(0, 50)}"` : '(insertion)';
            const r = `"${(c.replace ?? '').slice(0, 50)}"`;
            console.log(`    [${i+1}] find: ${f} → replace: ${r}`);
        });
        failed++;
        failures.push({ name: test.name, reason: err });
    } else {
        console.log(`✓  (${changes.length} ops)  [${elapsed}ms]`);
        passed++;
    }
}

const totalMs = Date.now() - totalStart;
const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
const min = Math.min(...times);
const max = Math.max(...times);

console.log();
console.log('='.repeat(60));
console.log(`Results: ${passed}/${TESTS.length} passed, ${failed} failed`);
console.log(`Timing:  avg ${avg}ms  min ${min}ms  max ${max}ms  total ${(totalMs/1000).toFixed(1)}s`);
if (failures.length > 0) {
    console.log('\nFailed tests:');
    failures.forEach(f => console.log(`  ✗ ${f.name}: ${f.reason}`));
}
console.log('='.repeat(60));
process.exit(failed > 0 ? 1 : 0);
