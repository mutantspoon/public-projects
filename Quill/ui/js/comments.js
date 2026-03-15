/**
 * Google Docs-style commenting for Quill.
 * Comments are stored as <!-- @quill-comment: note --> tokens in the markdown.
 */

import { getEditor } from './editor.js';
import { editorViewCtx } from '@milkdown/core';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { Plugin, PluginKey, TextSelection } from '@milkdown/prose/state';
import { getLlmApiKey, setLlmApiKey, getLlmProvider, setLlmProvider, getGeminiApiKey, setGeminiApiKey } from './bridge.js';

// ─── State ────────────────────────────────────────────────────────────────────

let comments = [];          // { id, note, from, to, resolved }
let nextCommentId = 1;
let commentsEnabled = false;
let onCommentsChangedCallback = null;
let panelVisible = false;
let pluginInstalled = false;
let pendingFrom = null;
let pendingTo = null;

// Review mode state
let reviewMode = false;
let aiSuggestions = []; // { change, comment, state: 'accepted'|'skipped', range }
let reviewOriginal = null;
let reviewActiveComments = []; // all comments sent to the AI — removed on Accept All

const commentPluginKey = new PluginKey('quillComments');

// ─── ProseMirror Plugin ───────────────────────────────────────────────────────

function createCommentPlugin() {
    return new Plugin({
        key: commentPluginKey,
        state: {
            init() {
                return DecorationSet.empty;
            },
            apply(tr, decorationSet) {
                const meta = tr.getMeta(commentPluginKey);
                if (meta) {
                    return meta.decorationSet;
                }
                return decorationSet.map(tr.mapping, tr.doc);
            }
        },
        props: {
            decorations(state) {
                return this.getState(state);
            }
        }
    });
}

export function installCommentPlugin() {
    if (pluginInstalled) return;

    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const existing = commentPluginKey.get(view.state);
        if (existing !== undefined) {
            pluginInstalled = true;
            return;
        }

        const newState = view.state.reconfigure({
            plugins: [...view.state.plugins, createCommentPlugin()]
        });
        view.updateState(newState);
        pluginInstalled = true;
    } catch (e) {
        console.error('Error installing comment plugin:', e);
    }
}

function updateDecorations() {
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state } = view;

        const decorations = [];
        // In review mode the doc has changed so original comment positions are stale — skip them
        if (!reviewMode) {
            comments.forEach(c => {
                if (!c.resolved && c.from != null && c.to != null && c.from < c.to) {
                    decorations.push(
                        Decoration.inline(c.from, c.to, { class: 'comment-highlight', 'data-comment-id': c.id })
                    );
                }
            });
        }
        // Pending selection while the new-comment input is open
        if (pendingFrom !== null && pendingTo !== null && pendingFrom < pendingTo) {
            decorations.push(
                Decoration.inline(pendingFrom, pendingTo, { class: 'comment-pending-highlight' })
            );
        }
        // Green highlights for active AI suggestions in review mode
        if (reviewMode) {
            aiSuggestions.forEach(s => {
                if (isActive(s) && s.range) {
                    decorations.push(
                        Decoration.inline(s.range.from, s.range.to, { class: 'ai-suggestion-highlight' })
                    );
                }
            });
        }

        const decorationSet = DecorationSet.create(state.doc, decorations);
        const tr = state.tr.setMeta(commentPluginKey, { decorationSet });
        view.dispatch(tr);
    } catch (e) {
        console.error('Error updating comment decorations:', e);
    }
}

// Strip markdown syntax to get plain text for searching in ProseMirror text nodes
function markdownToPlainText(text) {
    return text
        .replace(/^#{1,6}\s+/gm, '')        // headings
        .replace(/^[*\-+]\s+/gm, '')         // bullet list markers
        .replace(/^\d+\.\s+/gm, '')          // ordered list markers
        .replace(/\*\*(.*?)\*\*/gs, '$1')    // bold
        .replace(/__(.*?)__/gs, '$1')        // bold alt
        .replace(/\*(.*?)\*/gs, '$1')        // italic
        .replace(/_(.*?)_/gs, '$1')          // italic alt
        .replace(/`([^`]+)`/g, '$1')         // inline code
        .split('\n').map(l => l.trim()).filter(l => l.length > 0)
        .join('\n')
        .trim();
}

// ─── Text Position Helper ─────────────────────────────────────────────────────

function findTextInDoc(view, searchText) {
    if (!searchText) return null;
    const { doc } = view.state;
    const nodes = [];
    doc.descendants((node, pos) => {
        if (node.isText) nodes.push({ text: node.text, pos });
    });
    // Build combined text inserting '\n' at block boundaries (gap between text nodes).
    // This mirrors how doc.textBetween(from, to, '\n') works, so multi-line anchor
    // text captured with that separator can be found here.
    let combined = '';
    const posMap = []; // index in combined → doc pos (-1 for synthetic newlines)
    let prevEnd = -1;
    nodes.forEach(({ text, pos }) => {
        if (prevEnd !== -1 && pos > prevEnd) {
            posMap.push(-1);
            combined += '\n';
        }
        for (let j = 0; j < text.length; j++) posMap.push(pos + j);
        combined += text;
        prevEnd = pos + text.length;
    });
    const idx = combined.indexOf(searchText);
    if (idx === -1) return null;
    // Skip any synthetic newline chars at the start/end of the match
    let fi = idx;
    while (fi < posMap.length && posMap[fi] === -1) fi++;
    if (fi >= posMap.length) return null;
    let ti = idx + searchText.length - 1;
    while (ti >= 0 && posMap[ti] === -1) ti--;
    if (ti < 0) return null;
    return { from: posMap[fi], to: posMap[ti] + 1 };
}

function scrollToComment(from, to) {
    const editor = getEditor();
    if (!editor) return;
    try {
        const view = editor.ctx.get(editorViewCtx);
        const sel = TextSelection.create(view.state.doc, from, to);
        view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
        view.focus();
    } catch (e) {}
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initComments(options = {}) {
    commentsEnabled = options.commentsEnabled ?? false;
    onCommentsChangedCallback = options.onCommentsChanged || null;

    createCommentPanel();
}

export function setCommentsEnabledLocal(val) {
    commentsEnabled = val;
}

export function startNewComment() {
    const editor = getEditor();
    if (!editor) return;
    try {
        const view = editor.ctx.get(editorViewCtx);
        const { from, to } = view.state.selection;
        if (from === to) return; // nothing selected
        pendingFrom = from;
        pendingTo = to;
        updateDecorations(); // show pending highlight
    } catch (e) {
        return;
    }

    // Open panel if not visible
    if (!panelVisible) {
        panelVisible = true;
        const panel = document.getElementById('comment-panel');
        if (panel) panel.classList.remove('hidden');
        const btn = document.getElementById('btn-comments');
        if (btn) btn.classList.add('active');
    }

    // Show and focus inline input
    const inputArea = document.getElementById('comment-input-area');
    if (inputArea) {
        inputArea.classList.remove('hidden');
        const textarea = inputArea.querySelector('textarea');
        if (textarea) {
            textarea.value = '';
            setTimeout(() => textarea.focus(), 30);
        }
    }
}

export function addCommentAtSelection(noteText) {
    if (!commentsEnabled || !noteText) return null;

    const editor = getEditor();
    if (!editor) return null;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { from, to } = view.state.selection;
        if (from === to) return null;

        const comment = {
            id: String(nextCommentId++),
            note: noteText,
            from,
            to,
            resolved: false,
        };
        comments.push(comment);
        updateDecorations();
        renderCommentList();
        if (onCommentsChangedCallback) onCommentsChangedCallback();
        return comment;
    } catch (e) {
        console.error('Error adding comment:', e);
        return null;
    }
}

export function deleteComment(id) {
    comments = comments.filter(c => c.id !== id);
    updateDecorations();
    renderCommentList();
    if (onCommentsChangedCallback) onCommentsChangedCallback();
}

export function resolveComment(id) {
    const c = comments.find(c => c.id === id);
    if (c) {
        c.resolved = true;
        c.from = null;
        c.to = null;
    }
    updateDecorations();
    renderCommentList();
    if (onCommentsChangedCallback) onCommentsChangedCallback();
}

export function setTabComments(arr) {
    comments = arr || [];
    nextCommentId = comments.reduce((max, c) => Math.max(max, parseInt(c.id) + 1), 1);
    updateDecorations();
    renderCommentList();
}

export function getTabComments() {
    return [...comments];
}

export function parseCommentsFromMarkdown(markdown) {
    if (!markdown) return;

    const regex = /<!--\s*@quill-comment:\s*([\s\S]*?)\s*-->/g;
    const parsed = [];
    let m;
    while ((m = regex.exec(markdown)) !== null) {
        const raw = m[1].trim();
        const pipeIdx = raw.indexOf(' | anchor: ');
        const note       = pipeIdx !== -1 ? raw.slice(0, pipeIdx).trim() : raw;
        const anchorText = pipeIdx !== -1 ? raw.slice(pipeIdx + 11).trim() : null;
        parsed.push({
            id: String(nextCommentId++),
            note,
            anchorText,
            from: null,
            to: null,
            resolved: false,
        });
    }
    if (parsed.length > 0) {
        comments = parsed;
        renderCommentList();
        // Re-anchor positions after editor settles (Milkdown needs a tick to process)
        setTimeout(() => reanchorComments(), 300);
    }
}

function reanchorComments() {
    const editor = getEditor();
    if (!editor) return;
    try {
        const view = editor.ctx.get(editorViewCtx);
        let changed = false;
        comments.forEach(c => {
            if (c.anchorText && c.from == null) {
                const range = findTextInDoc(view, c.anchorText);
                if (range) {
                    c.from = range.from;
                    c.to   = range.to;
                    changed = true;
                }
            }
        });
        if (changed) updateDecorations();
    } catch (e) { console.error('reanchorComments error:', e); }
}

export function embedCommentsInMarkdown(markdown) {
    // Strip existing comment tokens
    let cleaned = markdown.replace(/\s*<!--\s*@quill-comment:[\s\S]*?-->/g, '');
    cleaned = cleaned.trimEnd();

    const active = comments.filter(c => !c.resolved);
    if (active.length === 0) return cleaned;

    const tokens = active.map(c => {
        if (c.anchorText) {
            return `<!-- @quill-comment: ${c.note} | anchor: ${c.anchorText.replace(/-->/g, '--&gt;')} -->`;
        }
        return `<!-- @quill-comment: ${c.note} -->`;
    }).join('\n');
    return cleaned + '\n\n' + tokens + '\n';
}

// Strip all @quill-comment HTML comment tokens from a markdown string
function stripCommentTokens(md) {
    return md
        .replace(/\s*<!--\s*@quill-comment:[\s\S]*?-->/g, '')
        .replace(/<!--\s*-->/g, '')  // bare empty comments left by AI
        .trim();
}

// Parse JSON from AI response — handles fences, preamble, thinking text, and truncation
function parseJsonResponse(text) {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');

    // Try the complete array first
    if (start !== -1 && end > start) {
        try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {}
    }

    // Response truncated — recover all complete objects before the cut-off
    if (start !== -1) {
        const chunk = text.slice(start);
        // Try closing after the last }, (followed by another object)
        const afterLastObj = chunk.lastIndexOf('},');
        if (afterLastObj !== -1) {
            try { return JSON.parse(chunk.slice(0, afterLastObj + 1) + ']'); } catch (e) {}
        }
        // Try closing after the last lone }
        const lastBrace = chunk.lastIndexOf('}');
        if (lastBrace !== -1) {
            try { return JSON.parse(chunk.slice(0, lastBrace + 1) + ']'); } catch (e) {}
        }
    }

    // Last resort: strip markdown fences
    const cleaned = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```$/m, '').trim();
    return JSON.parse(cleaned);
}

export async function applyCommentsWithLLM() {
    const active = comments.filter(c => !c.resolved);
    if (active.length === 0) return null;

    const provider = await getLlmProvider();

    const { getContent } = await import('./editor.js');
    // Strip any embedded comment tokens before sending to AI
    const markdown = stripCommentTokens(getContent());
    if (!markdown) return null;

    // Build comment list with anchor context so AI knows what text each comment is attached to
    let editorView = null;
    try {
        const editor = getEditor();
        if (editor) editorView = editor.ctx.get(editorViewCtx);
    } catch (e) {}

    // Build comment list with anchor + surrounding context so AI understands intent
    const commentList = active.map((c, i) => {
        let anchor = '';
        if (editorView && c.from != null && c.to != null) {
            try {
                const selected = editorView.state.doc.textBetween(c.from, c.to, '\n').trim();
                if (selected) {
                    anchor = ` [section: "${selected.slice(0, 300)}"]`;
                }
            } catch (e) {}
        }
        return `${i + 1}.${anchor} ${c.note}`;
    }).join('\n');

    const systemPrompt = `You are a writing assistant for Markdown documents.
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

    const userMessage = `Document:\n\n${markdown}\n\nRevision instructions:\n${commentList}`;

    try {
        let rawResponse;

        if (provider === 'gemini') {
            const apiKey = await getGeminiApiKey();
            if (!apiKey) return null;

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
                const msg = err?.error?.message || `HTTP ${response.status}`;
                console.error('Gemini API error:', err);
                throw new Error(`Gemini: ${msg}`);
            }

            const data = await response.json();
            rawResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        } else {
            const apiKey = await getLlmApiKey();
            if (!apiKey) return null;

            // Route through Rust to avoid WKWebView blocking custom headers
            const { invoke } = await import('@tauri-apps/api/core');
            const data = await invoke('call_anthropic', {
                apiKey,
                system: systemPrompt,
                user: userMessage,
                model: 'claude-haiku-4-5-20251001',
            });

            if (data?.error) {
                throw new Error(`Anthropic: ${data.error.message || JSON.stringify(data.error)}`);
            }

            rawResponse = data?.content?.[0]?.text;
        }

        if (!rawResponse) throw new Error('API returned empty response');

        try {
            const changes = parseJsonResponse(rawResponse);
            return { original: markdown, activeComments: active, changes };
        } catch (e) {
            console.error('Failed to parse AI JSON response:', e, rawResponse);
            throw new Error('Could not parse AI response as JSON');
        }
    } catch (e) {
        console.error('Error calling LLM API:', e);
        throw e;
    }
}

export function toggleCommentPanel() {
    panelVisible = !panelVisible;
    const panel = document.getElementById('comment-panel');
    if (panel) {
        panel.classList.toggle('hidden', !panelVisible);
    }
    return panelVisible;
}

export function isCommentPanelVisible() {
    return panelVisible;
}

// ─── Panel DOM ────────────────────────────────────────────────────────────────

function createCommentPanel() {
    // Remove existing panel if any
    const existing = document.getElementById('comment-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'comment-panel';
    panel.className = 'comment-panel hidden';

    // Header
    const header = document.createElement('div');
    header.className = 'comment-panel-header';
    const title = document.createElement('span');
    title.className = 'comment-panel-title';
    title.textContent = 'Comments';
    const addCommentBtn = document.createElement('button');
    addCommentBtn.className = 'comment-action-btn comment-action-accept';
    addCommentBtn.id = 'comment-add-btn';
    addCommentBtn.textContent = '+ Comment';
    addCommentBtn.title = 'Add comment on selected text';
    addCommentBtn.style.cssText = 'font-size: 11px; padding: 2px 7px;';
    addCommentBtn.addEventListener('click', () => startNewComment());

    const closeBtn = document.createElement('button');
    closeBtn.className = 'comment-panel-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => {
        panelVisible = false;
        panel.classList.add('hidden');
        const btn = document.getElementById('btn-comments');
        if (btn) btn.classList.remove('active');
    });
    header.appendChild(title);
    header.appendChild(addCommentBtn);
    header.appendChild(closeBtn);

    // Inline new-comment input area (hidden until startNewComment() is called)
    const inputArea = document.createElement('div');
    inputArea.className = 'comment-input-area hidden';
    inputArea.id = 'comment-input-area';

    const inputTextarea = document.createElement('textarea');
    inputTextarea.className = 'comment-input-textarea';
    inputTextarea.placeholder = 'Add comment… (Enter to save, Esc to cancel)';
    inputTextarea.rows = 2;

    function submitNewComment() {
        const note = inputTextarea.value.trim();
        if (note && pendingFrom !== null && pendingTo !== null) {
            // Capture the anchor text so we can re-find it after file reload
            let anchorText = null;
            try {
                const view = getEditor().ctx.get(editorViewCtx);
                anchorText = view.state.doc.textBetween(pendingFrom, pendingTo, '\n').trim() || null;
            } catch (e) {}
            const comment = {
                id: String(nextCommentId++),
                note,
                from: pendingFrom,
                to: pendingTo,
                anchorText,
                resolved: false,
            };
            comments.push(comment);
            updateDecorations();
            renderCommentList();
            if (onCommentsChangedCallback) onCommentsChangedCallback();
        }
        inputArea.classList.add('hidden');
        inputTextarea.value = '';
        pendingFrom = null;
        pendingTo = null;
        updateDecorations(); // clear pending highlight
    }

    function cancelNewComment() {
        inputArea.classList.add('hidden');
        inputTextarea.value = '';
        pendingFrom = null;
        pendingTo = null;
        updateDecorations(); // clear pending highlight
    }

    inputTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitNewComment();
        } else if (e.key === 'Escape') {
            cancelNewComment();
        }
    });

    const inputSubmitBtn = document.createElement('button');
    inputSubmitBtn.className = 'comment-input-submit';
    inputSubmitBtn.textContent = 'Add';
    inputSubmitBtn.addEventListener('click', submitNewComment);

    inputArea.appendChild(inputTextarea);
    inputArea.appendChild(inputSubmitBtn);

    // Comment list
    const list = document.createElement('div');
    list.className = 'comment-list';
    list.id = 'comment-list';

    // Footer
    const footer = document.createElement('div');
    footer.className = 'comment-panel-footer';
    footer.id = 'comment-panel-footer';

    // Dynamic button area (Apply with AI or Accept All / Discard All)
    const footerButtons = document.createElement('div');
    footerButtons.id = 'comment-footer-buttons';
    footer.appendChild(footerButtons);

    // API key section
    const apiSection = document.createElement('div');
    apiSection.className = 'comment-api-section';

    const apiToggle = document.createElement('button');
    apiToggle.className = 'comment-api-toggle';
    apiToggle.textContent = 'API Key';
    apiToggle.addEventListener('click', () => {
        apiForm.classList.toggle('hidden');
    });

    const apiForm = document.createElement('div');
    apiForm.className = 'comment-api-form hidden';

    // Provider dropdown
    const providerSelect = document.createElement('select');
    providerSelect.className = 'comment-provider-select';
    const optAnthropic = document.createElement('option');
    optAnthropic.value = 'anthropic';
    optAnthropic.textContent = 'Anthropic Claude';
    const optGemini = document.createElement('option');
    optGemini.value = 'gemini';
    optGemini.textContent = 'Google Gemini 3 Flash';
    providerSelect.appendChild(optAnthropic);
    providerSelect.appendChild(optGemini);

    const apiInput = document.createElement('input');
    apiInput.type = 'password';
    apiInput.placeholder = 'sk-ant-...';
    apiInput.className = 'comment-api-input';

    // Cache for both keys so switching doesn't wipe unsaved edits
    const keyCache = { anthropic: '', gemini: '' };

    // Load current provider and both keys on init
    Promise.all([getLlmProvider(), getLlmApiKey(), getGeminiApiKey()])
        .then(([provider, anthKey, gemKey]) => {
            keyCache.anthropic = anthKey || '';
            keyCache.gemini = gemKey || '';
            providerSelect.value = provider || 'anthropic';
            apiInput.placeholder = provider === 'gemini' ? 'AIza...' : 'sk-ant-...';
            apiInput.value = provider === 'gemini' ? keyCache.gemini : keyCache.anthropic;
        })
        .catch(() => {});

    providerSelect.addEventListener('change', async () => {
        const prev = providerSelect.value === 'gemini' ? 'anthropic' : 'gemini';
        keyCache[prev] = apiInput.value;
        await setLlmProvider(providerSelect.value);
        apiInput.placeholder = providerSelect.value === 'gemini' ? 'AIza...' : 'sk-ant-...';
        apiInput.value = keyCache[providerSelect.value];
    });

    const apiSaveBtn = document.createElement('button');
    apiSaveBtn.className = 'comment-api-save';
    apiSaveBtn.textContent = 'Save';
    apiSaveBtn.addEventListener('click', async () => {
        const key = apiInput.value.trim();
        if (providerSelect.value === 'gemini') {
            await setGeminiApiKey(key);
            keyCache.gemini = key;
        } else {
            await setLlmApiKey(key);
            keyCache.anthropic = key;
        }
        apiForm.classList.add('hidden');
    });

    apiForm.appendChild(providerSelect);
    apiForm.appendChild(apiInput);
    apiForm.appendChild(apiSaveBtn);
    apiSection.appendChild(apiToggle);
    apiSection.appendChild(apiForm);
    footer.appendChild(apiSection);

    panel.appendChild(header);
    panel.appendChild(inputArea);
    panel.appendChild(list);
    panel.appendChild(footer);

    // Insert before the editor in the editor-container
    const editorContainer = document.getElementById('editor-container');
    if (editorContainer) {
        editorContainer.appendChild(panel);
    }

    renderCommentList();
    renderFooter();
}

// ─── Footer Rendering ─────────────────────────────────────────────────────────

function renderFooter() {
    const buttonsEl = document.getElementById('comment-footer-buttons');
    if (!buttonsEl) return;
    buttonsEl.innerHTML = '';

    if (reviewMode) {
        // Count by unique comment groups, not by individual changes
        const totalGroups  = new Set(aiSuggestions.map(s => s.comment?.id ?? '__unmatched__')).size;
        const activeGroups = new Set(
            aiSuggestions.filter(s => isActive(s)).map(s => s.comment?.id ?? '__unmatched__')
        ).size;

        const acceptAllBtn = document.createElement('button');
        acceptAllBtn.className = 'comment-apply-btn';
        acceptAllBtn.style.cssText = 'background: #22c55e; margin-bottom: 6px;';
        acceptAllBtn.textContent = `Accept All (${activeGroups}/${totalGroups})`;
        acceptAllBtn.addEventListener('click', async () => {
            const finalDoc = buildProposedDoc();
            const activeCommentIds = new Set(reviewActiveComments.map(c => c.id));
            const { setContent } = await import('./editor.js');
            await setContent(stripCommentTokens(finalDoc));
            comments = comments.filter(c => !activeCommentIds.has(c.id));
            updateDecorations();
            if (onCommentsChangedCallback) onCommentsChangedCallback();
            const count = totalGroups;
            exitReviewMode();
            const { showSuccess } = await import('./toast.js');
            showSuccess(`${count} change${count !== 1 ? 's' : ''} accepted`);
        });

        const discardAllBtn = document.createElement('button');
        discardAllBtn.className = 'comment-apply-btn';
        discardAllBtn.style.cssText = 'background: transparent; color: var(--text); border: 1px solid var(--border);';
        discardAllBtn.textContent = 'Discard All';
        discardAllBtn.addEventListener('click', async () => {
            const { setContent } = await import('./editor.js');
            await setContent(stripCommentTokens(reviewOriginal));
            exitReviewMode();
        });

        buttonsEl.appendChild(acceptAllBtn);
        buttonsEl.appendChild(discardAllBtn);
    } else {
        const applyBtn = document.createElement('button');
        applyBtn.className = 'comment-apply-btn';
        applyBtn.textContent = 'Apply All with AI';
        applyBtn.addEventListener('click', handleApplyWithAI);
        buttonsEl.appendChild(applyBtn);
    }
}

// ─── Comment List Rendering ───────────────────────────────────────────────────

function renderCommentList() {
    const list = document.getElementById('comment-list');
    if (!list) return;

    list.innerHTML = '';

    // ── Review mode: show AI suggestion cards ──
    if (reviewMode) {
        if (aiSuggestions.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'comment-empty';
            empty.textContent = 'No suggestions';
            list.appendChild(empty);
            return;
        }

        // Group suggestions by source comment so 3 comments → 3 cards, not N-change cards
        const groups = new Map(); // commentId → { comment, suggestions }
        aiSuggestions.forEach(s => {
            const key = s.comment ? s.comment.id : '__unmatched__';
            if (!groups.has(key)) groups.set(key, { comment: s.comment, suggestions: [] });
            groups.get(key).suggestions.push(s);
        });

        groups.forEach(({ comment, suggestions }) => {
            const card = document.createElement('div');
            card.className = 'comment-card';
            card.style.cursor = 'pointer';
            card.title = 'Click to jump to this change in the editor';

            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                const first = suggestions.find(s => isActive(s) && s.range);
                if (first) scrollToComment(first.range.from, first.range.to);
            });

            const noteEl = document.createElement('div');
            noteEl.className = 'comment-note';
            noteEl.textContent = comment ? comment.note : (suggestions[0].change.comment || 'AI suggestion');

            if (suggestions.length > 1) {
                const countEl = document.createElement('div');
                countEl.style.cssText = 'font-size:0.75em;opacity:0.55;margin-top:2px';
                countEl.textContent = `${suggestions.length} changes`;
                noteEl.appendChild(countEl);
            }

            const actions = document.createElement('div');
            actions.className = 'comment-actions';

            const acceptBtn = document.createElement('button');
            acceptBtn.className = 'comment-action-btn comment-action-accept';
            acceptBtn.textContent = '✓';
            acceptBtn.title = 'Accept all changes for this comment';

            const revertBtn = document.createElement('button');
            revertBtn.className = 'comment-action-btn comment-action-revert';
            revertBtn.textContent = '✗';
            revertBtn.title = 'Discard all changes for this comment';

            acceptBtn.addEventListener('click', async () => {
                // Bake this group's changes permanently into reviewOriginal,
                // then remove from aiSuggestions so the card disappears.
                suggestions.forEach(s => {
                    reviewOriginal = applyFindReplace(reviewOriginal, s.change.find, s.change.replace);
                });
                aiSuggestions = aiSuggestions.filter(s => !suggestions.includes(s));
                if (comment) {
                    comments = comments.filter(c => c.id !== comment.id);
                    reviewActiveComments = reviewActiveComments.filter(c => c.id !== comment.id);
                    if (onCommentsChangedCallback) onCommentsChangedCallback();
                }
                if (aiSuggestions.length === 0) {
                    const { setContent } = await import('./editor.js');
                    await setContent(stripCommentTokens(reviewOriginal));
                    updateDecorations();
                    exitReviewMode();
                    const { showSuccess } = await import('./toast.js');
                    showSuccess('All changes applied');
                } else {
                    await rebuildAndRefresh();
                }
            });

            revertBtn.addEventListener('click', async () => {
                // Discard this group's changes and remove the card.
                aiSuggestions = aiSuggestions.filter(s => !suggestions.includes(s));
                if (comment) {
                    reviewActiveComments = reviewActiveComments.filter(c => c.id !== comment.id);
                }
                if (aiSuggestions.length === 0) {
                    const { setContent } = await import('./editor.js');
                    await setContent(stripCommentTokens(reviewOriginal));
                    updateDecorations();
                    exitReviewMode();
                } else {
                    await rebuildAndRefresh();
                }
            });

            actions.appendChild(acceptBtn);
            actions.appendChild(revertBtn);
            card.appendChild(noteEl);
            card.appendChild(actions);
            list.appendChild(card);
        });
        return;
    }

    // ── Normal mode: show comment cards ──
    const visible = comments.filter(c => !c.resolved);
    if (visible.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'comment-empty';
        empty.textContent = 'No comments';
        list.appendChild(empty);
        return;
    }

    visible.forEach(c => {
        const card = document.createElement('div');
        card.className = 'comment-card';
        card.dataset.commentId = c.id;
        if (c.from != null) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', (e) => {
                if (e.target.tagName === 'BUTTON') return;
                if (c.from != null && c.to != null) scrollToComment(c.from, c.to);
            });
        }

        const noteEl = document.createElement('div');
        noteEl.className = 'comment-note';
        noteEl.textContent = c.note;
        noteEl.title = 'Double-click to edit';
        noteEl.addEventListener('dblclick', () => {
            noteEl.contentEditable = 'true';
            noteEl.classList.add('editing');
            noteEl.focus();
            // Place cursor at end
            const range = document.createRange();
            range.selectNodeContents(noteEl);
            range.collapse(false);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);

            function saveEdit() {
                noteEl.contentEditable = 'false';
                noteEl.classList.remove('editing');
                const updated = noteEl.textContent.trim();
                if (updated) {
                    c.note = updated;
                    if (onCommentsChangedCallback) onCommentsChangedCallback();
                } else {
                    noteEl.textContent = c.note; // restore if emptied
                }
            }
            noteEl.addEventListener('blur', saveEdit, { once: true });
            noteEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    noteEl.blur();
                } else if (e.key === 'Escape') {
                    noteEl.removeEventListener('blur', saveEdit);
                    noteEl.textContent = c.note;
                    noteEl.contentEditable = 'false';
                    noteEl.classList.remove('editing');
                }
            });
        });

        const actions = document.createElement('div');
        actions.className = 'comment-actions';

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'comment-action-btn comment-action-delete';
        deleteBtn.textContent = 'Delete';
        deleteBtn.addEventListener('click', () => deleteComment(c.id));

        actions.appendChild(deleteBtn);
        card.appendChild(noteEl);
        card.appendChild(actions);
        list.appendChild(card);
    });
}

async function handleApplyWithAI() {
    const buttonsEl = document.getElementById('comment-footer-buttons');
    const applyBtn = buttonsEl ? buttonsEl.querySelector('button') : null;
    if (applyBtn) {
        applyBtn.textContent = 'Applying...';
        applyBtn.disabled = true;
    }

    try {
        const provider = await getLlmProvider();
        const apiKey = provider === 'gemini' ? await getGeminiApiKey() : await getLlmApiKey();
        if (!apiKey) {
            const apiForm = document.querySelector('.comment-api-form');
            if (apiForm) apiForm.classList.remove('hidden');
            const { showError } = await import('./toast.js');
            const providerName = provider === 'gemini' ? 'Gemini' : 'Anthropic';
            showError(`Enter your ${providerName} API key first`);
            return;
        }

        let result;
        try {
            result = await applyCommentsWithLLM();
        } catch (apiErr) {
            const { showError } = await import('./toast.js');
            showError(apiErr.message);
            return;
        }

        if (result) {
            await startReviewMode(result.original, result.activeComments, result.changes);
        } else {
            const { showError } = await import('./toast.js');
            showError('AI returned no changes — check your comments and try again');
        }
    } finally {
        // Only restore if we didn't enter review mode
        if (!reviewMode && applyBtn) {
            applyBtn.textContent = 'Apply All with AI';
            applyBtn.disabled = false;
        }
    }
}

// ─── Review Mode ──────────────────────────────────────────────────────────────

function applyFindReplace(doc, find, replace) {
    if (!find) return doc.trimEnd() + (replace ? '\n\n' + replace : '');
    const idx = doc.indexOf(find);
    if (idx === -1) return doc; // text not found — no-op
    return doc.slice(0, idx) + replace + doc.slice(idx + find.length);
}

function isActive(s) {
    // 'pending' and 'accepted' both apply the change; only 'skipped' removes it
    return s.state !== 'skipped';
}

function buildProposedDoc() {
    let doc = reviewOriginal;
    aiSuggestions.forEach(s => {
        if (isActive(s)) {
            doc = applyFindReplace(doc, s.change.find, s.change.replace);
        }
    });
    return doc;
}

async function refreshReviewHighlights() {
    const editor = getEditor();
    if (!editor) return;
    try {
        const view = editor.ctx.get(editorViewCtx);
        aiSuggestions.forEach(s => {
            if (!s.change.replace || s.change.replace.trim().length === 0) {
                s.range = null;
                return;
            }
            // Strip markdown syntax — ProseMirror text nodes contain plain text only
            // e.g. "* Green Goblin" → "Green Goblin", "## Heading" → "Heading"
            const searchText = markdownToPlainText(s.change.replace);
            s.range = searchText.length > 2 ? findTextInDoc(view, searchText) : null;
        });
    } catch (e) {}
    updateDecorations();
}

async function rebuildAndRefresh() {
    const { setContent } = await import('./editor.js');
    const proposedDoc = buildProposedDoc();
    await setContent(stripCommentTokens(proposedDoc));
    setTimeout(async () => {
        await refreshReviewHighlights();
        renderCommentList();
        renderFooter();
    }, 80);
}

async function startReviewMode(original, activeComments, changes) {
    const { setContent } = await import('./editor.js');

    reviewOriginal = original;

    // 1. Apply ALL changes to build the proposed doc
    let proposedDoc = original;
    changes.forEach(change => {
        proposedDoc = applyFindReplace(proposedDoc, change.find, change.replace);
    });

    // 2. Set review mode state — all start as 'pending' (user must explicitly accept/revert)
    // Match each AI change back to the original comment it came from.
    // The AI echoes the instruction text in change.comment — find the best matching source comment.
    function matchComment(changeComment) {
        if (!changeComment) return activeComments[0] || null;
        const lower = changeComment.toLowerCase();
        // Exact or substring match on note
        let best = activeComments.find(ac => lower.includes(ac.note.toLowerCase().slice(0, 30)));
        if (!best) best = activeComments.find(ac => ac.note.toLowerCase().split(' ').some(w => w.length > 4 && lower.includes(w)));
        return best || null;
    }

    reviewMode = true;
    reviewActiveComments = activeComments;
    aiSuggestions = changes.map(c => ({
        change: c,
        comment: matchComment(c.comment),
        state: 'pending',
        range: null,
    }));

    // 3. Load proposed content into editor
    await setContent(stripCommentTokens(proposedDoc));

    // 4. Make panel visible
    if (!panelVisible) {
        panelVisible = true;
        const panel = document.getElementById('comment-panel');
        if (panel) panel.classList.remove('hidden');
        const btn = document.getElementById('btn-comments');
        if (btn) btn.classList.add('active');
    }

    // 5. Hide new-comment input and add button while in review
    const inputArea = document.getElementById('comment-input-area');
    if (inputArea) inputArea.classList.add('hidden');
    const addBtn = document.getElementById('comment-add-btn');
    if (addBtn) addBtn.style.display = 'none';

    // 6. Render review cards and footer immediately
    renderCommentList();
    renderFooter();

    // 7. After editor settles, find text positions and show green highlights
    setTimeout(async () => {
        await refreshReviewHighlights();
        renderCommentList();
        renderFooter();
    }, 80);
}

function exitReviewMode() {
    reviewMode = false;
    aiSuggestions = [];
    reviewOriginal = null;
    reviewActiveComments = [];

    // inputArea stays hidden — only shown when startNewComment() is called
    const addBtn = document.getElementById('comment-add-btn');
    if (addBtn) addBtn.style.display = '';
    updateDecorations();
    renderCommentList();
    renderFooter();
}
