/**
 * Toolbar functionality and formatting commands.
 */

import { getEditor, getContent, setContent, focus } from './editor.js';
import { newFile, openFile, saveFile, setModified, setTheme } from './bridge.js';
import { showSuccess, showError } from './toast.js';

// Tab integration callbacks
let createNewTab = null;
let openFileInTabCallback = null;
let setActiveTabPathCallback = null;
let setActiveTabModifiedCallback = null;
let getActiveTabCallback = null;

/**
 * Set tab integration callbacks.
 */
export function setTabCallbacks(callbacks = {}) {
    createNewTab = callbacks.createNewTab;
    openFileInTabCallback = callbacks.openFileInTab;
    setActiveTabPathCallback = callbacks.setActiveTabPath;
    setActiveTabModifiedCallback = callbacks.setActiveTabModified;
    getActiveTabCallback = callbacks.getActiveTab;
}
import { editorViewCtx, schemaCtx } from '@milkdown/core';
import { callCommand } from '@milkdown/utils';
import {
    toggleStrongCommand,
    toggleEmphasisCommand,
    wrapInBlockquoteCommand,
    wrapInBulletListCommand,
    wrapInOrderedListCommand,
    toggleInlineCodeCommand,
    createCodeBlockCommand,
} from '@milkdown/preset-commonmark';
import { toggleStrikethroughCommand, insertTableCommand } from '@milkdown/preset-gfm';
import { setBlockType, toggleMark } from '@milkdown/prose/commands';
import { promptForText } from './dialog.js';

// Store callbacks
let onContentChange = null;
let getIsModified = null;
let clearModifiedCallback = null;
let getSaveContentCallback = null;

/**
 * Initialize toolbar button handlers.
 */
export function initToolbar(callbacks = {}) {
    onContentChange = callbacks.onContentChange;
    getIsModified = callbacks.getIsModified || (() => false);
    clearModifiedCallback = callbacks.clearModified || (() => {});
    getSaveContentCallback = callbacks.getSaveContent || null;

    // Prevent all toolbar buttons from stealing focus from the editor
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
        });
    });

    // After any format/block-affecting button fires a command, refresh
    // button states on the next frame so toggles light up immediately
    // (without waiting for the user to type or move the cursor).
    const stateRefreshIds = [
        'btn-bold', 'btn-italic', 'btn-strike', 'btn-code', 'btn-link',
        'btn-quote', 'btn-codeblock', 'btn-bullet', 'btn-numlist', 'btn-task',
        'btn-h1', 'btn-h2', 'btn-h3',
    ];
    stateRefreshIds.forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => {
            requestAnimationFrame(updateButtonStates);
        });
    });

    // File operations
    document.getElementById('btn-new').addEventListener('click', handleNew);
    document.getElementById('btn-open').addEventListener('click', handleOpen);
    document.getElementById('btn-save').addEventListener('click', handleSave);

    // Formatting
    document.getElementById('btn-bold').addEventListener('click', handleBold);
    document.getElementById('btn-italic').addEventListener('click', handleItalic);
    document.getElementById('btn-strike').addEventListener('click', handleStrikethrough);
    document.getElementById('btn-code').addEventListener('click', handleCode);

    // Insert
    document.getElementById('btn-link').addEventListener('click', handleLink);
    document.getElementById('btn-image').addEventListener('click', handleImage);
    document.getElementById('btn-h1').addEventListener('click', () => { handleHeading(1); closeHeadingDropdown(); });
    document.getElementById('btn-h2').addEventListener('click', () => { handleHeading(2); closeHeadingDropdown(); });
    document.getElementById('btn-h3').addEventListener('click', () => { handleHeading(3); closeHeadingDropdown(); });
    document.getElementById('btn-bullet').addEventListener('click', handleBulletList);
    document.getElementById('btn-numlist').addEventListener('click', handleNumberedList);
    document.getElementById('btn-task').addEventListener('click', handleTaskList);
    document.getElementById('btn-quote').addEventListener('click', handleBlockquote);
    document.getElementById('btn-codeblock').addEventListener('click', handleCodeBlock);
    document.getElementById('btn-table').addEventListener('click', handleTable);

    // Heading dropdown toggle
    setupHeadingDropdown();

    // Theme
    document.getElementById('btn-theme').addEventListener('click', handleThemeToggle);

}

// ─── Heading Dropdown ────────────────────────────────────────────────────

function setupHeadingDropdown() {
    const dropdown = document.getElementById('heading-dropdown');
    const btn = document.getElementById('btn-heading');
    const menu = document.getElementById('heading-menu');

    if (!dropdown || !btn || !menu) return;

    // Toggle dropdown on click
    btn.addEventListener('click', (e) => {
        e.stopPropagation();

        // Close other dropdowns
        document.querySelectorAll('.dropdown.open').forEach(d => {
            if (d !== dropdown) d.classList.remove('open');
        });

        // Toggle this dropdown
        dropdown.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        dropdown.classList.remove('open');
    });

    // Prevent dropdown menu clicks from closing prematurely
    menu.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

function closeHeadingDropdown() {
    const dropdown = document.getElementById('heading-dropdown');
    if (dropdown) {
        dropdown.classList.remove('open');
    }
}

// ─── Content Access ─────────────────────────────────────────────────────
// Source Mode was removed; these wrappers stay so the rest of the app keeps
// a single name for "current document content." Inline them next refactor.

export function getSourceContent() {
    return getContent();
}

export function setSourceContent(content) {
    setContent(content);
}

// Retained so callers (find/replace, keyboard shortcut guards) don't need
// to change. Source Mode is gone, so this is always false.
export function isInSourceMode() {
    return false;
}

// ─── File Operations ────────────────────────────────────────────────────

async function handleNew() {
    // With tabs, always create a new tab instead of replacing content
    if (createNewTab) {
        createNewTab();
    } else {
        // Fallback for single-file mode
        if (getIsModified()) {
            if (!confirm('Discard unsaved changes?')) {
                return;
            }
        }

        const result = await newFile();
        if (result.success) {
            setSourceContent('');
            clearModifiedCallback();
            if (onContentChange) onContentChange('');
        }
    }

    focus();
}

async function handleOpen() {
    const result = await openFile();
    if (result.success) {
        // With tabs, open in a new tab
        if (openFileInTabCallback) {
            openFileInTabCallback(result.path, result.content);
        } else {
            // Fallback for single-file mode
            setSourceContent(result.content);
            clearModifiedCallback();
            await setModified(false);
        }
    }

    focus();
}

export async function handleSave() {
    const content = getSaveContentCallback ? getSaveContentCallback() : getSourceContent();
    // Pass the active tab's path explicitly so Rust writes to the right file
    // even if set_current_file is in flight from a recent tab switch.
    const activeTab = getActiveTabCallback ? getActiveTabCallback() : null;
    const result = await saveFile(content, activeTab?.path || null);
    if (result.success) {
        clearModifiedCallback();
        await setModified(false);

        // Update active tab path and modified state
        if (setActiveTabPathCallback) {
            setActiveTabPathCallback(result.path);
        }
        if (setActiveTabModifiedCallback) {
            setActiveTabModifiedCallback(false);
        }

        showSuccess(`Saved: ${result.path.replace(/\\/g, '/').split('/').pop()}`);

        focus();
        return true;
    } else if (result.error) {
        showError(`Error saving file: ${result.error}`);
    }

    focus();
    return false;
}

// ─── Formatting Commands ────────────────────────────────────────────────

/**
 * Toggle a mark at the current cursor. Works on both ranges (toggles across
 * the selection) and empty selections (flips the storedMarks so the next
 * typed character carries the mark). For empty selections, ProseMirror's
 * toggleMark already does the right thing — we still go through it for
 * consistency, but explicitly handle the case where the mark needs to be
 * forced on/off to keep behavior predictable across providers.
 */
// Common Milkdown/GFM mark name aliases — Milkdown's commonmark and GFM
// presets use different node names than vanilla ProseMirror in places.
const MARK_ALIASES = {
    strong: ['strong'],
    emphasis: ['emphasis', 'em'],
    strikethrough: ['strike_through', 'strikethrough'],
    code: ['inlineCode', 'inline_code', 'code'],
    link: ['link'],
};

function resolveMark(schema, name) {
    const aliases = MARK_ALIASES[name] || [name];
    for (const n of aliases) {
        if (schema.marks[n]) return schema.marks[n];
    }
    return null;
}

function toggleMarkAtCursor(markName) {
    const editor = getEditor();
    if (!editor) { focus(); return; }
    try {
        const view = editor.ctx.get(editorViewCtx);
        const schema = editor.ctx.get(schemaCtx);
        const markType = resolveMark(schema, markName);
        if (!markType) { focus(); return; }

        const { state, dispatch } = view;
        const { selection } = state;

        if (selection.empty) {
            // Flip storedMarks so the next character typed carries the mark.
            const current = state.storedMarks || selection.$from.marks();
            const has = !!markType.isInSet(current);
            const next = has
                ? markType.removeFromSet(current)
                : markType.create().addToSet(current);
            dispatch(state.tr.setStoredMarks(next));
        } else {
            toggleMark(markType)(state, dispatch);
        }
    } catch (e) {
        console.error(`Error toggling ${markName}:`, e);
    }
    focus();
}

function handleBold()          { toggleMarkAtCursor('strong'); }
function handleItalic()        { toggleMarkAtCursor('emphasis'); }
function handleStrikethrough() { toggleMarkAtCursor('strikethrough'); }
function handleCode()          { toggleMarkAtCursor('code'); }

async function handleLink() {
    const editor = getEditor();
    if (!editor) return;

    // Capture the current selection BEFORE the modal steals focus.
    const view = editor.ctx.get(editorViewCtx);
    const { from, to } = view.state.selection;
    const hasSelection = from !== to;
    const selectedText = hasSelection ? view.state.doc.textBetween(from, to, ' ') : '';

    const url = await promptForText({
        title: 'Insert link',
        placeholder: 'https://example.com',
        confirmLabel: 'Insert',
    });
    if (!url) { focus(); return; }

    try {
        const schema = editor.ctx.get(schemaCtx);
        const linkMark = schema.marks.link?.create({ href: url });
        if (!linkMark) { focus(); return; }
        const state = view.state;
        const text = selectedText || url;
        // insertText shifts later positions when text length differs from
        // (to - from) — `from` stays put but the end must be `from + text.length`
        // measured in the doc AFTER the insert. Map both ends through the
        // transaction so the addMark range covers exactly the inserted text.
        const tr = state.tr.insertText(text, from, to);
        const markFrom = tr.mapping.map(from, 1);
        const markTo = markFrom + text.length;
        tr.addMark(markFrom, markTo, linkMark);
        view.dispatch(tr);
    } catch (e) {
        console.error('Error inserting link:', e);
    }
    focus();
}

async function handleImage() {
    const editor = getEditor();
    if (!editor) return;

    const url = await promptForText({
        title: 'Insert image URL',
        placeholder: 'https://example.com/image.png',
        confirmLabel: 'Next',
    });
    if (!url) { focus(); return; }

    const alt = await promptForText({
        title: 'Alt text (optional)',
        placeholder: 'Describe the image',
        confirmLabel: 'Insert',
    }) || '';

    try {
        const view = editor.ctx.get(editorViewCtx);
        const schema = editor.ctx.get(schemaCtx);
        const imageType = schema.nodes.image;
        const { state } = view;
        if (imageType) {
            const imageNode = imageType.create({ src: url, alt });
            view.dispatch(state.tr.replaceSelectionWith(imageNode, false));
        } else {
            // Fallback to raw markdown
            const text = `![${alt}](${url})`;
            view.dispatch(state.tr.insertText(text));
        }
    } catch (e) {
        console.error('Error inserting image:', e);
    }
    focus();
}

function handleHeading(level) {
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const schema = editor.ctx.get(schemaCtx);
        const { state, dispatch } = view;

        const headingType = schema.nodes.heading;
        const paragraphType = schema.nodes.paragraph;

        if (!headingType || !paragraphType) return;

        const { $from } = state.selection;
        let parentBlock = $from.parent;

        // If selection is at doc level (e.g., Cmd+A), find the first block
        if (parentBlock.type.name === 'doc') {
            const firstChild = parentBlock.firstChild;
            if (firstChild) {
                parentBlock = firstChild;
            }
        }

        const isCurrentlyHeading = parentBlock.type.name === 'heading';
        const currentLevel = isCurrentlyHeading ? parentBlock.attrs.level : 0;

        if (isCurrentlyHeading && currentLevel === level) {
            setBlockType(paragraphType)(state, dispatch);
        } else {
            setBlockType(headingType, { level })(state, dispatch);
        }
    } catch (e) {
        console.error('Error setting heading:', e);
    }
    focus();
}

function runCommand(commandKey) {
    const editor = getEditor();
    if (editor) editor.action(callCommand(commandKey));
    focus();
}

function handleBulletList()   { runCommand(wrapInBulletListCommand.key); }
function handleBlockquote()   { runCommand(wrapInBlockquoteCommand.key); }
function handleNumberedList() { runCommand(wrapInOrderedListCommand.key); }

// Milkdown's GFM preset doesn't have a separate task_list_item node —
// task items are list_item nodes with a `checked` attr (null = regular
// bullet, false = unchecked task, true = checked task). To "turn the
// current line into a task," we wrap it in a bullet list (if not already)
// then set every enclosing list_item's checked attr to false. Toggling
// off resets checked → null so it becomes a plain bullet.
function handleTaskList() {
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const schema = editor.ctx.get(schemaCtx);
        const listItemType = schema.nodes.list_item;
        if (!listItemType) { focus(); return; }

        // Step 1: if we're not in any list, wrap in a bullet list first.
        // (If we're already in a list — bullet or ordered — just flip the
        // checked attr on the enclosing list_item.)
        if (!isInAnyList(view.state)) {
            editor.action(callCommand(wrapInBulletListCommand.key));
        }

        // Re-read state after the wrap dispatch.
        const { state } = view;
        const { $from } = state.selection;

        // Find the nearest enclosing list_item.
        let depth = -1;
        for (let d = $from.depth; d >= 0; d--) {
            if ($from.node(d).type === listItemType) { depth = d; break; }
        }
        if (depth === -1) { focus(); return; }

        const itemNode = $from.node(depth);
        const itemPos = $from.before(depth);
        const wasTask = itemNode.attrs?.checked != null;

        // Toggle: task → plain bullet, plain bullet → task (unchecked)
        const nextChecked = wasTask ? null : false;
        const tr = state.tr.setNodeMarkup(itemPos, undefined, {
            ...itemNode.attrs,
            checked: nextChecked,
        });
        view.dispatch(tr);
    } catch (e) {
        console.error('Error toggling task list:', e);
    }
    focus();
}

function isInAnyList(state) {
    const { $from } = state.selection;
    for (let d = $from.depth; d >= 0; d--) {
        const name = $from.node(d).type.name;
        if (name === 'bullet_list' || name === 'ordered_list') return true;
    }
    return false;
}

export function handleCodeBlock() { runCommand(createCodeBlockCommand.key); }

function handleTable() {
    const editor = getEditor();
    if (!editor) return;

    try {
        // Try using the GFM insert table command
        editor.action(callCommand(insertTableCommand.key));
    } catch (e) {
        // Fallback: insert markdown table text
        try {
            const view = editor.ctx.get(editorViewCtx);
            const { state, dispatch } = view;
            const tableMarkdown = '\n| Header 1 | Header 2 | Header 3 |\n| --- | --- | --- |\n| Cell 1 | Cell 2 | Cell 3 |\n';
            const tr = state.tr.insertText(tableMarkdown);
            dispatch(tr);
        } catch (e2) {
            console.error('Error inserting table:', e2);
        }
    }
    focus();
}

// ─── Theme ──────────────────────────────────────────────────────────────

async function handleThemeToggle() {
    const currentTheme = document.body.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.body.setAttribute('data-theme', newTheme);
    // Sun icon when dark (switch to light), moon when light (switch to dark)
    document.getElementById('btn-theme').textContent = newTheme === 'dark' ? '☀' : '☾';

    await setTheme(newTheme);
}

export async function applyTheme(theme) {
    document.body.setAttribute('data-theme', theme);
    document.getElementById('btn-theme').textContent = theme === 'dark' ? '☀' : '☾';
}

// ─── Word Wrap ───────────────────────────────────────────────────────────

let wordWrapEnabled = true;

export function handleWordWrapToggle() {
    wordWrapEnabled = !wordWrapEnabled;
    applyWordWrap(wordWrapEnabled);
}

export function applyWordWrap(enabled) {
    wordWrapEnabled = enabled;
    const editor = document.getElementById('editor');
    const wrapBtn = document.getElementById('btn-wrap');

    if (enabled) {
        editor?.classList.remove('no-wrap');
        wrapBtn?.classList.remove('active');
    } else {
        editor?.classList.add('no-wrap');
        wrapBtn?.classList.add('active');
    }
}

export function isWordWrapEnabled() {
    return wordWrapEnabled;
}

// ─── Cursor-Aware Button States ──────────────────────────────────────────
// Syncs .active class on format buttons with the ProseMirror selection so
// the toolbar reflects what's under the cursor (Bold lit inside **bold**,
// Bullet lit inside a list, etc).

function setBtn(id, on) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', !!on);
}

export function updateButtonStates() {
    const editor = getEditor();
    if (!editor) return;
    try {
        const view = editor.ctx.get(editorViewCtx);
        const schema = editor.ctx.get(schemaCtx);
        const { state } = view;
        const { selection } = state;
        const { $from } = selection;

        const markActive = (markType) => {
            if (!markType) return false;
            if (selection.empty) {
                return !!markType.isInSet(state.storedMarks || $from.marks());
            }
            return state.doc.rangeHasMark(selection.from, selection.to, markType);
        };

        // Walk up the ancestor chain by type name (handles aliases)
        const inNode = (...names) => {
            for (let d = $from.depth; d >= 0; d--) {
                if (names.includes($from.node(d).type.name)) return true;
            }
            return false;
        };

        // Inline marks
        setBtn('btn-bold',   markActive(resolveMark(schema, 'strong')));
        setBtn('btn-italic', markActive(resolveMark(schema, 'emphasis')));
        setBtn('btn-strike', markActive(resolveMark(schema, 'strikethrough')));
        setBtn('btn-code',   markActive(resolveMark(schema, 'code')));
        setBtn('btn-link',   markActive(resolveMark(schema, 'link')));

        // Task list: in Milkdown GFM, a task item is a list_item with
        // attrs.checked !== null. Plain bullet items have checked == null.
        let inTask = false;
        for (let d = $from.depth; d >= 0; d--) {
            const node = $from.node(d);
            if (node.type.name === 'list_item' && node.attrs && node.attrs.checked != null) {
                inTask = true; break;
            }
        }

        // Block containers
        setBtn('btn-quote',     inNode('blockquote'));
        setBtn('btn-codeblock', inNode('code_block', 'fence'));
        setBtn('btn-bullet',    inNode('bullet_list') && !inTask);
        setBtn('btn-numlist',   inNode('ordered_list'));
        setBtn('btn-task',      inTask);
        setBtn('btn-heading',   inNode('heading'));
    } catch (e) {
        // Ignore — schema may not be ready on first call
    }
}
