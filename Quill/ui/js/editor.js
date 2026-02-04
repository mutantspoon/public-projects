/**
 * Milkdown editor setup and management.
 */

import { Editor, rootCtx, defaultValueCtx } from '@milkdown/core';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { history } from '@milkdown/plugin-history';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { getMarkdown, replaceAll, insert } from '@milkdown/utils';
import { editorViewCtx, serializerCtx, parserCtx } from '@milkdown/core';

// Prism syntax highlighting - uncomment after running: npm install @milkdown/plugin-prism prismjs
// import { prism, prismConfig } from '@milkdown/plugin-prism';
// import Prism from 'prismjs';
// import 'prismjs/components/prism-javascript';
// import 'prismjs/components/prism-typescript';
// import 'prismjs/components/prism-python';
// import 'prismjs/components/prism-css';
// import 'prismjs/components/prism-json';
// import 'prismjs/components/prism-bash';
// import 'prismjs/components/prism-markdown';
// import 'prismjs/components/prism-yaml';
// import 'prismjs/components/prism-go';
// import 'prismjs/components/prism-rust';
// import 'prismjs/components/prism-java';
// import 'prismjs/components/prism-c';
// import 'prismjs/components/prism-cpp';
// import 'prismjs/components/prism-sql';

let editorInstance = null;
let onChangeCallback = null;
let onSelectionChangeCallback = null;

/**
 * Initialize the Milkdown editor.
 */
export async function initEditor(container, options = {}) {
    const { initialContent = '', onChange, onSelectionChange } = options;

    onChangeCallback = onChange;
    onSelectionChangeCallback = onSelectionChange;

    editorInstance = await Editor.make()
        .config((ctx) => {
            ctx.set(rootCtx, container);
            ctx.set(defaultValueCtx, initialContent);

            // Configure Prism for syntax highlighting (uncomment after npm install)
            // ctx.set(prismConfig.key, {
            //     configureRefractor: () => Prism,
            // });

            // Set up change listener
            ctx.get(listenerCtx)
                .markdownUpdated((ctx, markdown, prevMarkdown) => {
                    if (onChangeCallback && markdown !== prevMarkdown) {
                        onChangeCallback(markdown);
                    }
                });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        // .use(prism)  // Uncomment after npm install
        .create();

    // Set up selection change listener
    if (onSelectionChange) {
        const view = editorInstance.ctx.get(editorViewCtx);
        view.dom.addEventListener('keyup', updateSelectionInfo);
        view.dom.addEventListener('mouseup', updateSelectionInfo);
        view.dom.addEventListener('focus', updateSelectionInfo);
    }

    // Click/mousedown on container should focus editor
    const view = editorInstance.ctx.get(editorViewCtx);

    container.addEventListener('mousedown', (e) => {
        // If clicking on the container padding (not on ProseMirror content), focus the editor
        if (e.target === container) {
            e.preventDefault();
            view.focus();
        }
    });

    // Also handle click to ensure focus after mousedown
    container.addEventListener('click', (e) => {
        if (!view.hasFocus()) {
            view.focus();
        }
    });

    return editorInstance;
}

/**
 * Update selection information (cursor position).
 */
function updateSelectionInfo() {
    if (!editorInstance || !onSelectionChangeCallback) return;

    try {
        const view = editorInstance.ctx.get(editorViewCtx);
        const { state } = view;
        const { selection } = state;
        const { from } = selection;

        // Calculate line and column
        const doc = state.doc;
        let pos = 0;
        let line = 1;
        let col = 1;

        doc.descendants((node, nodePos) => {
            if (nodePos >= from) return false;

            if (node.isBlock) {
                if (nodePos + node.nodeSize <= from) {
                    line++;
                    col = 1;
                } else {
                    col = from - nodePos;
                }
            }
            return true;
        });

        // Simpler approach: count newlines in text content up to position
        const textBefore = doc.textBetween(0, from, '\n');
        const lines = textBefore.split('\n');
        line = lines.length;
        col = lines[lines.length - 1].length + 1;

        onSelectionChangeCallback({ line, col });
    } catch (e) {
        // Ignore errors during selection calculation
    }
}

/**
 * Get the current markdown content.
 */
export function getContent() {
    if (!editorInstance) return '';

    try {
        return editorInstance.action(getMarkdown());
    } catch (e) {
        console.error('Error getting content:', e);
        return '';
    }
}

/**
 * Set the editor content.
 */
export function setContent(markdown) {
    if (!editorInstance) return;

    try {
        editorInstance.action(replaceAll(markdown));
    } catch (e) {
        console.error('Error setting content:', e);
    }
}

/**
 * Clear the editor content.
 */
export function clearContent() {
    setContent('');
}

/**
 * Get word count from content.
 */
export function getWordCount() {
    const content = getContent();
    if (!content || !content.trim()) return 0;
    return content.trim().split(/\s+/).length;
}

/**
 * Insert text at cursor position.
 */
export function insertText(text) {
    if (!editorInstance) return;

    try {
        editorInstance.action(insert(text));
    } catch (e) {
        console.error('Error inserting text:', e);
    }
}

/**
 * Execute a command on the editor.
 */
export function executeCommand(command) {
    if (!editorInstance) return;

    try {
        const view = editorInstance.ctx.get(editorViewCtx);
        // Commands will be handled via prosemirror commands
        // This is a placeholder for formatting commands
    } catch (e) {
        console.error('Error executing command:', e);
    }
}

/**
 * Focus the editor.
 */
export function focus() {
    if (!editorInstance) return;

    try {
        const view = editorInstance.ctx.get(editorViewCtx);
        view.focus();
    } catch (e) {
        console.error('Error focusing editor:', e);
    }
}

/**
 * Destroy the editor instance.
 */
export function destroy() {
    if (editorInstance) {
        editorInstance.destroy();
        editorInstance = null;
    }
}

/**
 * Get the editor instance.
 */
export function getEditor() {
    return editorInstance;
}
