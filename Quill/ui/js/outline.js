/**
 * Document outline for Quill - shows heading hierarchy.
 */

import { getEditor } from './editor.js';
import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';

let outlineVisible = false;

/**
 * Initialize the outline panel.
 */
export function initOutline() {
    // Create outline panel if it doesn't exist
    if (!document.getElementById('outline-panel')) {
        createOutlinePanel();
    }
}

/**
 * Create the outline panel element.
 */
function createOutlinePanel() {
    const panel = document.createElement('div');
    panel.id = 'outline-panel';
    panel.className = 'outline-panel hidden';
    panel.innerHTML = `
        <div class="outline-header">
            <span class="outline-title">Outline</span>
            <button class="outline-close" id="outline-close">&times;</button>
        </div>
        <div class="outline-content" id="outline-content"></div>
    `;

    // Insert inside editor container, at the beginning
    const editorContainer = document.getElementById('editor-container');
    editorContainer.insertBefore(panel, editorContainer.firstChild);

    // Close button handler
    document.getElementById('outline-close').addEventListener('click', hideOutline);
}

/**
 * Toggle outline visibility.
 */
export function toggleOutline() {
    outlineVisible = !outlineVisible;

    const panel = document.getElementById('outline-panel');
    if (outlineVisible) {
        panel?.classList.remove('hidden');
        updateOutline();
    } else {
        panel?.classList.add('hidden');
    }

    return outlineVisible;
}

/**
 * Show the outline panel.
 */
export function showOutline() {
    if (!outlineVisible) {
        toggleOutline();
    }
}

/**
 * Hide the outline panel.
 */
export function hideOutline() {
    if (outlineVisible) {
        toggleOutline();
    }
}

/**
 * Check if outline is visible.
 */
export function isOutlineVisible() {
    return outlineVisible;
}

/**
 * Update the outline content based on document headings.
 */
export function updateOutline() {
    if (!outlineVisible) return;

    const content = document.getElementById('outline-content');
    if (!content) return;

    const editor = getEditor();
    if (!editor) {
        content.innerHTML = '<div class="outline-empty">No headings found</div>';
        return;
    }

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state } = view;
        const doc = state.doc;

        const headings = [];

        // Extract all headings from the document
        doc.descendants((node, pos) => {
            if (node.type.name === 'heading') {
                const level = node.attrs.level || 1;
                const text = node.textContent || 'Untitled';
                headings.push({ level, text, pos });
            }
            return true;
        });

        if (headings.length === 0) {
            content.innerHTML = '<div class="outline-empty">No headings found</div>';
            return;
        }

        // Build outline HTML
        const html = headings.map(h => `
            <div class="outline-item outline-level-${h.level}" data-pos="${h.pos}">
                ${escapeHtml(h.text)}
            </div>
        `).join('');

        content.innerHTML = html;

        // Add click handlers to navigate to headings
        content.querySelectorAll('.outline-item').forEach(item => {
            item.addEventListener('click', () => {
                const pos = parseInt(item.dataset.pos, 10);
                scrollToPosition(pos);
            });
        });

    } catch (e) {
        console.error('Error updating outline:', e);
        content.innerHTML = '<div class="outline-empty">Error loading outline</div>';
    }
}

/**
 * Scroll to a position in the document.
 */
function scrollToPosition(pos) {
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state, dispatch } = view;

        // Create a selection at the heading
        const tr = state.tr.setSelection(TextSelection.create(state.doc, pos));
        dispatch(tr.scrollIntoView());
        view.focus();
    } catch (e) {
        console.error('Error scrolling to position:', e);
    }
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
