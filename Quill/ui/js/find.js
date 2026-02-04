/**
 * Find & Replace functionality for Quill editor.
 */

import { getEditor, focus } from './editor.js';
import { editorViewCtx } from '@milkdown/core';
import { TextSelection } from '@milkdown/prose/state';

// State
let isVisible = false;
let currentQuery = '';
let matches = [];
let currentMatchIndex = -1;
let isReplaceMode = false;
let caseSensitive = false;

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

    // Return focus to editor
    focus();
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
 * Perform search and highlight matches.
 */
function performSearch() {
    clearHighlights();
    matches = [];
    currentMatchIndex = -1;

    if (!currentQuery) {
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

        updateMatchCount();

        // Highlight first match
        if (matches.length > 0) {
            currentMatchIndex = 0;
            selectMatch(currentMatchIndex);
        }
    } catch (e) {
        console.error('Search error:', e);
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
    selectMatch(currentMatchIndex);
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
    selectMatch(currentMatchIndex);
}

/**
 * Select a specific match.
 */
function selectMatch(index) {
    if (index < 0 || index >= matches.length) return;

    const match = matches[index];
    const editor = getEditor();
    if (!editor) return;

    try {
        const view = editor.ctx.get(editorViewCtx);
        const { state, dispatch } = view;

        // Create selection at match position
        const tr = state.tr.setSelection(
            TextSelection.create(state.doc, match.from, match.to)
        );

        // Scroll into view
        dispatch(tr.scrollIntoView());

        updateMatchCount();
    } catch (e) {
        console.error('Error selecting match:', e);
    }
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
        updateMatchCount();
    } catch (e) {
        console.error('Error replacing all:', e);
    }
}

/**
 * Clear all highlights.
 */
function clearHighlights() {
    // Highlights are handled via selection, nothing to clear
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
