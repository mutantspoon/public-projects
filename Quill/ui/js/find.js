/**
 * Find & Replace functionality for Quill editor.
 * Uses ProseMirror decorations for proper highlighting without stealing focus.
 */

import { getEditor } from './editor.js';
import { editorViewCtx } from '@milkdown/core';
import { Decoration, DecorationSet } from '@milkdown/prose/view';
import { Plugin, PluginKey } from '@milkdown/prose/state';

// State
let isVisible = false;
let currentQuery = '';
let matches = [];
let currentMatchIndex = -1;
let isReplaceMode = false;
let caseSensitive = false;

// Plugin key for find decorations
const findPluginKey = new PluginKey('find');

/**
 * Create the find plugin that manages decorations.
 */
function createFindPlugin() {
    return new Plugin({
        key: findPluginKey,
        state: {
            init() {
                return DecorationSet.empty;
            },
            apply(tr, decorationSet) {
                // Get decorations from transaction metadata
                const meta = tr.getMeta(findPluginKey);
                if (meta) {
                    return meta.decorationSet;
                }
                // Map decorations through document changes
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

// Install the plugin
let pluginInstalled = false;
function ensureFindPlugin() {
    if (pluginInstalled) return;

    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);

        // Check if plugin already exists
        const existingPlugin = findPluginKey.get(view.state);
        if (existingPlugin !== undefined) {
            pluginInstalled = true;
            return;
        }

        // Add the plugin
        const newState = view.state.reconfigure({
            plugins: [...view.state.plugins, createFindPlugin()]
        });
        view.updateState(newState);
        pluginInstalled = true;
    } catch (e) {
        console.error('Error installing find plugin:', e);
    }
}

/**
 * Initialize the find bar.
 */
export function initFind() {
    // Set up event listeners for the find bar
    const findInput = document.getElementById('find-input');
    const replaceInput = document.getElementById('replace-input');
    const findNextBtn = document.getElementById('find-next');
    const findPrevBtn = document.getElementById('find-prev');
    const findCloseBtn = document.getElementById('find-close');
    const replaceBtn = document.getElementById('replace-btn');
    const replaceAllBtn = document.getElementById('replace-all-btn');
    const toggleReplaceBtn = document.getElementById('toggle-replace');

    if (findInput) {
        findInput.addEventListener('input', (e) => {
            currentQuery = e.target.value;
            performSearch();
        });

        findInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    findPrev();
                } else {
                    findNext();
                }
            } else if (e.key === 'Escape') {
                hideFindBar();
            }
        });
    }

    if (replaceInput) {
        replaceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                replace();
            } else if (e.key === 'Escape') {
                hideFindBar();
            }
        });
    }

    if (findNextBtn) {
        findNextBtn.addEventListener('click', findNext);
    }

    if (findPrevBtn) {
        findPrevBtn.addEventListener('click', findPrev);
    }

    if (findCloseBtn) {
        findCloseBtn.addEventListener('click', hideFindBar);
    }

    if (replaceBtn) {
        replaceBtn.addEventListener('click', replace);
    }

    if (replaceAllBtn) {
        replaceAllBtn.addEventListener('click', replaceAll);
    }

    if (toggleReplaceBtn) {
        toggleReplaceBtn.addEventListener('click', toggleReplaceMode);
    }

    // Case sensitive toggle
    const caseSensitiveCheckbox = document.getElementById('find-case-sensitive');
    if (caseSensitiveCheckbox) {
        caseSensitiveCheckbox.addEventListener('change', (e) => {
            caseSensitive = e.target.checked;
            performSearch();
        });
    }

    // Ensure find plugin is installed
    ensureFindPlugin();
}

/**
 * Show the find bar.
 */
export function showFindBar(replaceMode = false) {
    const findBar = document.getElementById('find-bar');
    const findInput = document.getElementById('find-input');
    const replaceRow = document.getElementById('replace-row');

    if (!findBar) return;

    isVisible = true;
    isReplaceMode = replaceMode;

    findBar.classList.remove('hidden');

    if (replaceRow) {
        if (replaceMode) {
            replaceRow.classList.remove('hidden');
        } else {
            replaceRow.classList.add('hidden');
        }
    }

    // Get selected text and use as search query
    const editor = getEditor();
    if (editor) {
        try {
            const view = editor.ctx.get(editorViewCtx);
            const { state } = view;
            const { from, to } = state.selection;
            if (from !== to) {
                const selectedText = state.doc.textBetween(from, to);
                if (selectedText && selectedText.length < 100) {
                    currentQuery = selectedText;
                    if (findInput) {
                        findInput.value = selectedText;
                    }
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }

    // Focus the find input
    if (findInput) {
        findInput.focus();
        findInput.select();
    }

    // Ensure plugin is installed
    ensureFindPlugin();

    // Perform initial search if we have a query
    if (currentQuery) {
        performSearch();
    }
}

/**
 * Hide the find bar.
 */
export function hideFindBar() {
    const findBar = document.getElementById('find-bar');
    if (!findBar) return;

    isVisible = false;
    findBar.classList.add('hidden');

    // Clear highlights
    clearHighlights();
}

/**
 * Toggle replace mode.
 */
export function toggleReplaceMode() {
    const replaceRow = document.getElementById('replace-row');
    const toggleBtn = document.getElementById('toggle-replace');

    if (!replaceRow) return;

    isReplaceMode = !isReplaceMode;

    if (isReplaceMode) {
        replaceRow.classList.remove('hidden');
        if (toggleBtn) toggleBtn.textContent = '▼';
    } else {
        replaceRow.classList.add('hidden');
        if (toggleBtn) toggleBtn.textContent = '▶';
    }
}

/**
 * Perform search and apply decorations.
 */
function performSearch() {
    matches = [];
    currentMatchIndex = -1;

    if (!currentQuery) {
        clearHighlights();
        updateMatchCount();
        return;
    }

    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state } = view;
        const doc = state.doc;

        // Get all text content with positions
        const query = caseSensitive ? currentQuery : currentQuery.toLowerCase();

        doc.descendants((node, nodePos) => {
            if (node.isText) {
                const text = caseSensitive ? node.text : node.text.toLowerCase();
                let index = 0;
                while ((index = text.indexOf(query, index)) !== -1) {
                    matches.push({
                        from: nodePos + index,
                        to: nodePos + index + currentQuery.length,
                    });
                    index += currentQuery.length;
                }
            }
            return true;
        });

        // Highlight first match
        if (matches.length > 0) {
            currentMatchIndex = 0;
        }

        updateDecorations();
        updateMatchCount();

        // Scroll to first match
        if (matches.length > 0) {
            scrollToMatch(currentMatchIndex);
        }
    } catch (e) {
        console.error('Search error:', e);
    }
}

/**
 * Update decorations for all matches.
 */
function updateDecorations() {
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state } = view;

        const decorations = [];

        // Add decorations for all matches
        matches.forEach((match, index) => {
            const className = index === currentMatchIndex ? 'find-match-current' : 'find-match';
            decorations.push(
                Decoration.inline(match.from, match.to, { class: className })
            );
        });

        const decorationSet = DecorationSet.create(state.doc, decorations);

        // Apply decorations via transaction
        const tr = state.tr.setMeta(findPluginKey, { decorationSet });
        view.dispatch(tr);
    } catch (e) {
        console.error('Error updating decorations:', e);
    }
}

/**
 * Scroll to a specific match without stealing focus.
 */
function scrollToMatch(index) {
    if (index < 0 || index >= matches.length) return;

    const match = matches[index];
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);

        // Get the DOM node at the match position
        const domPos = view.domAtPos(match.from);
        if (!domPos || !domPos.node) return;

        // Find the closest element node (text nodes can't scrollIntoView)
        let targetElement = domPos.node;
        if (targetElement.nodeType === Node.TEXT_NODE) {
            targetElement = targetElement.parentElement;
        }

        if (targetElement && targetElement.scrollIntoView) {
            // Scroll with smooth behavior and center alignment
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'nearest'
            });
        }
    } catch (e) {
        console.error('Error scrolling to match:', e);
    }
}

/**
 * Find next match.
 */
export function findNext() {
    if (matches.length === 0) {
        performSearch();
        return;
    }

    currentMatchIndex = (currentMatchIndex + 1) % matches.length;
    updateDecorations();
    updateMatchCount();
    scrollToMatch(currentMatchIndex);
}

/**
 * Find previous match.
 */
export function findPrev() {
    if (matches.length === 0) {
        performSearch();
        return;
    }

    currentMatchIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
    updateDecorations();
    updateMatchCount();
    scrollToMatch(currentMatchIndex);
}

/**
 * Replace current match.
 */
export function replace() {
    if (matches.length === 0 || currentMatchIndex < 0) return;

    const replaceInput = document.getElementById('replace-input');
    const replaceText = replaceInput ? replaceInput.value : '';

    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state, dispatch } = view;
        const match = matches[currentMatchIndex];

        // Replace the current match
        const tr = state.tr.replaceWith(
            match.from,
            match.to,
            state.schema.text(replaceText)
        );
        dispatch(tr);

        // Re-search to update matches
        setTimeout(() => {
            performSearch();
        }, 0);
    } catch (e) {
        console.error('Error replacing:', e);
    }
}

/**
 * Replace all matches.
 */
export function replaceAll() {
    if (matches.length === 0) return;

    const replaceInput = document.getElementById('replace-input');
    const replaceText = replaceInput ? replaceInput.value : '';

    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state, dispatch } = view;

        // Replace from end to start to preserve positions
        let tr = state.tr;
        const sortedMatches = [...matches].sort((a, b) => b.from - a.from);

        sortedMatches.forEach(match => {
            tr = tr.replaceWith(
                match.from,
                match.to,
                state.schema.text(replaceText)
            );
        });

        dispatch(tr);

        // Clear matches
        matches = [];
        currentMatchIndex = -1;
        clearHighlights();
        updateMatchCount();
    } catch (e) {
        console.error('Error replacing all:', e);
    }
}

/**
 * Clear all highlights.
 */
function clearHighlights() {
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state } = view;

        // Clear decorations
        const decorationSet = DecorationSet.empty;
        const tr = state.tr.setMeta(findPluginKey, { decorationSet });
        view.dispatch(tr);
    } catch (e) {
        // Ignore errors
    }
}

/**
 * Update match count display.
 */
function updateMatchCount() {
    const countEl = document.getElementById('find-count');
    if (!countEl) return;

    if (matches.length === 0) {
        if (currentQuery) {
            countEl.textContent = 'No results';
        } else {
            countEl.textContent = '';
        }
    } else {
        countEl.textContent = `${currentMatchIndex + 1} of ${matches.length}`;
    }
}

/**
 * Check if find bar is visible.
 */
export function isFindVisible() {
    return isVisible;
}
