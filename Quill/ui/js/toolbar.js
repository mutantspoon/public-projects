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

/**
 * Set tab integration callbacks.
 */
export function setTabCallbacks(callbacks = {}) {
    createNewTab = callbacks.createNewTab;
    openFileInTabCallback = callbacks.openFileInTab;
    setActiveTabPathCallback = callbacks.setActiveTabPath;
    setActiveTabModifiedCallback = callbacks.setActiveTabModified;
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
import { setBlockType } from '@milkdown/prose/commands';

// Store callbacks
let onContentChange = null;
let getIsModified = null;
let clearModifiedCallback = null;
let isSourceMode = false;

/**
 * Initialize toolbar button handlers.
 */
export function initToolbar(callbacks = {}) {
    onContentChange = callbacks.onContentChange;
    getIsModified = callbacks.getIsModified || (() => false);
    clearModifiedCallback = callbacks.clearModified || (() => {});

    // Prevent all toolbar buttons from stealing focus from the editor
    document.querySelectorAll('.toolbar-btn').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
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

    // Source mode toggle
    document.getElementById('btn-source').addEventListener('click', handleSourceToggle);

    // Heading dropdown toggle
    setupHeadingDropdown();

    // Theme
    document.getElementById('btn-theme').addEventListener('click', handleThemeToggle);

    // Source editor change handler
    document.getElementById('source-editor').addEventListener('input', handleSourceInput);
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

// ─── Source Mode ────────────────────────────────────────────────────────

export function handleSourceToggle() {
    const editor = document.getElementById('editor');
    const sourceEditor = document.getElementById('source-editor');
    const sourceBtn = document.getElementById('btn-source');
    const statusMode = document.getElementById('status-mode');
    const statusModeSep = document.getElementById('status-mode-sep');

    isSourceMode = !isSourceMode;

    if (isSourceMode) {
        // Switch to source mode
        const content = getContent();
        sourceEditor.value = content;
        editor.classList.add('hidden');
        sourceEditor.classList.remove('hidden');
        sourceBtn.classList.add('active');
        statusMode.style.display = 'inline';
        statusModeSep.style.display = 'inline';
        sourceEditor.focus();
    } else {
        // Switch to WYSIWYG mode
        const content = sourceEditor.value;
        setContent(content);
        sourceEditor.classList.add('hidden');
        editor.classList.remove('hidden');
        sourceBtn.classList.remove('active');
        statusMode.style.display = 'none';
        statusModeSep.style.display = 'none';
        focus();
    }
}

function handleSourceInput(e) {
    if (onContentChange) {
        onContentChange(e.target.value);
    }
}

export function isInSourceMode() {
    return isSourceMode;
}

export function getSourceContent() {
    if (isSourceMode) {
        return document.getElementById('source-editor').value;
    }
    return getContent();
}

export function setSourceContent(content) {
    if (isSourceMode) {
        document.getElementById('source-editor').value = content;
    } else {
        setContent(content);
    }
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

    if (isSourceMode) {
        document.getElementById('source-editor').focus();
    } else {
        focus();
    }
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

    if (isSourceMode) {
        document.getElementById('source-editor').focus();
    } else {
        focus();
    }
}

export async function handleSave() {
    const content = getSourceContent();
    const result = await saveFile(content);
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

        if (isSourceMode) {
            document.getElementById('source-editor').focus();
        } else {
            focus();
        }
        return true;
    } else if (result.error) {
        showError(`Error saving file: ${result.error}`);
    }

    if (isSourceMode) {
        document.getElementById('source-editor').focus();
    } else {
        focus();
    }
    return false;
}

// ─── Formatting Commands ────────────────────────────────────────────────

function handleBold() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(toggleStrongCommand.key));
    }
    focus();
}

function handleItalic() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(toggleEmphasisCommand.key));
    }
    focus();
}

function handleStrikethrough() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(toggleStrikethroughCommand.key));
    }
    focus();
}

function handleCode() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(toggleInlineCodeCommand.key));
    }
    focus();
}

function handleLink() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (!editor) return;

    const url = prompt('Enter URL:');
    if (!url) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const { from, to } = state.selection;
        const selectedText = from !== to ? state.doc.textBetween(from, to) : 'link text';

        // Create link node using schema
        const schema = editor.ctx.get(schemaCtx);
        const linkMark = schema.marks.link.create({ href: url });
        const textNode = schema.text(selectedText, [linkMark]);

        const tr = state.tr.replaceSelectionWith(textNode, false);
        dispatch(tr);
    } catch (e) {
        console.error('Error inserting link:', e);
    }
    focus();
}

function handleImage() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (!editor) return;

    const url = prompt('Enter image URL:');
    if (!url) return;

    const alt = prompt('Enter alt text (optional):', '') || 'image';

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const schema = editor.ctx.get(schemaCtx);

        // Check if image node type exists
        const imageType = schema.nodes.image;
        if (imageType) {
            const imageNode = imageType.create({ src: url, alt: alt });
            const tr = state.tr.replaceSelectionWith(imageNode);
            dispatch(tr);
        } else {
            // Fallback: insert markdown image syntax
            const { from } = state.selection;
            const imageMarkdown = `![${alt}](${url})`;
            const tr = state.tr.insertText(imageMarkdown, from);
            dispatch(tr);
        }
    } catch (e) {
        console.error('Error inserting image:', e);
    }
    focus();
}

function handleHeading(level) {
    if (isSourceMode) return;
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

function handleBulletList() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(wrapInBulletListCommand.key));
    }
    focus();
}

function handleBlockquote() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(wrapInBlockquoteCommand.key));
    }
    focus();
}

function handleNumberedList() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(wrapInOrderedListCommand.key));
    }
    focus();
}

function handleTaskList() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const schema = editor.ctx.get(schemaCtx);
        const { state, dispatch } = view;

        // Insert a task list item as markdown and let Milkdown parse it
        const taskListNode = schema.nodes.task_list_item;
        if (taskListNode) {
            // Create task list item
            const taskItem = taskListNode.create({ checked: false });
            const tr = state.tr.replaceSelectionWith(taskItem);
            dispatch(tr);
        } else {
            // Fallback: insert markdown text
            const { from } = state.selection;
            const tr = state.tr.insertText('- [ ] ', from);
            dispatch(tr);
        }
    } catch (e) {
        console.error('Error inserting task list:', e);
    }
    focus();
}

export function handleCodeBlock() {
    if (isSourceMode) return;
    const editor = getEditor();
    if (editor) {
        editor.action(callCommand(createCodeBlockCommand.key));
    }
    focus();
}

function handleTable() {
    if (isSourceMode) return;
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

// ─── Status Updates ─────────────────────────────────────────────────────

function updateStatusMessage(message) {
    const statusEl = document.getElementById('status-message');
    if (statusEl) {
        statusEl.textContent = message;
        setTimeout(() => {
            statusEl.textContent = '';
        }, 3000);
    }
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
    const sourceEditor = document.getElementById('source-editor');
    const wrapBtn = document.getElementById('btn-wrap');

    if (enabled) {
        editor?.classList.remove('no-wrap');
        sourceEditor?.classList.remove('no-wrap');
        wrapBtn?.classList.remove('active');
    } else {
        editor?.classList.add('no-wrap');
        sourceEditor?.classList.add('no-wrap');
        wrapBtn?.classList.add('active');
    }
}

export function isWordWrapEnabled() {
    return wordWrapEnabled;
}
