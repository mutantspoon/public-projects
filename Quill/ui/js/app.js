/**
 * Quill - Main application entry point.
 * Initializes the Milkdown editor and wires up all components.
 */

import { initEditor, getContent, getWordCount, focus } from './editor.js';
import { initToolbar, handleSave, applyTheme, getSourceContent, setSourceContent, handleWordWrapToggle, applyWordWrap, handleCodeBlock, setTabCallbacks, isInSourceMode } from './toolbar.js';
import { getSettings, setModified, getApi, setFontSize, getRecentFiles, openRecentFile, clearRecentFiles, setCurrentFile, getStartupFile, revealInFinder, savePdf, getCommentsEnabled, setCommentsEnabled } from './bridge.js';
import { initComments, installCommentPlugin, toggleCommentPanel, setTabComments, getTabComments, parseCommentsFromMarkdown, embedCommentsInMarkdown, startNewComment, setCommentsEnabledLocal } from './comments.js';
import { generatePdfB64 } from './pdf-export.js';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { initTabs, createTab, closeActiveTab, getActiveTab, setActiveTabModified, setActiveTabPath, openFileInTab, newTab, nextTab, prevTab, getAllTabs, getTabByPath, switchToTab, hasDirtyTabs, handleAppClose } from './tabs.js';
import { initFind, showFindBar, hideFindBar, findNext, findPrev, isFindVisible } from './find.js';
import { showToast, showSuccess, showError, showInfo } from './toast.js';
import { initAutosave, clearDrafts } from './autosave.js';
import { initOutline, toggleOutline, updateOutline, isOutlineVisible } from './outline.js';

// Track state
let currentFontSize = 14;
let ignoreNextChanges = 0;  // Counter to ignore change events after loading
let commentsEnabled = false;

// Export modified state checker - uses tabs as single source of truth
export function getIsModified() {
    const tab = getActiveTab();
    return tab ? tab.modified : false;
}

export function clearModified() {
    setActiveTabModified(false);
}

export function setLoadingContent(ignore = true) {
    // Ignore the next change event(s) after loading content
    if (ignore) {
        ignoreNextChanges = 2;  // Ignore a couple events to be safe
    }
}

/**
 * Initialize the application.
 */
async function init() {
    // Load settings and apply
    try {
        const settings = await getSettings();
        applyTheme(settings.theme);
        currentFontSize = settings.font_size || 14;
        applyFontSize(currentFontSize);
        // Apply word wrap setting
        if (settings.word_wrap !== undefined) {
            applyWordWrap(settings.word_wrap);
        }
    } catch (e) {
        applyTheme('dark');
        applyFontSize(14);
    }

    // Initialize the editor
    const editorContainer = document.getElementById('editor');
    await initEditor(editorContainer, {
        initialContent: '',
        onChange: handleContentChange,
        onSelectionChange: handleSelectionChange,
    });

    // Install comment plugin (must come after editor init)
    installCommentPlugin();

    // Initialize comments
    try {
        commentsEnabled = await getCommentsEnabled();
    } catch (e) {}
    initComments({
        commentsEnabled,
        onCommentsChanged: () => setActiveTabModified(true),
    });

    // Initialize toolbar
    initToolbar({
        onContentChange: (content) => {
            handleContentChange(content);
        },
        getIsModified: getIsModified,
        clearModified: clearModified,
        getSaveContent: () => embedCommentsInMarkdown(getSourceContent()),
    });

    // Clear any old drafts and initialize tabs
    clearDrafts();
    initTabs({
        onTabChange: handleTabChange,
        onContentRequest: getSourceContent,
        getIsModified: getIsModified,
        clearModified: clearModified,
        setLoadingContent: setLoadingContent,
        onSave: handleSave,
        getTabComments: getTabComments,
    });

    // Set up tab callbacks for toolbar
    setTabCallbacks({
        createNewTab: newTab,
        openFileInTab: openFileInTab,
        setActiveTabPath: setActiveTabPath,
        setActiveTabModified: setActiveTabModified,
    });

    // Initialize autosave
    initAutosave({
        getContent: getSourceContent,
        getTabs: getAllTabs,
    });

    // Expose tab functions globally (used by open-file event listener below)
    window._quillTabs = { openFileInTab };

    // Initialize find & replace
    initFind();

    // Initialize outline
    initOutline();

    // Set up export PDF button
    document.getElementById('btn-export-pdf').addEventListener('click', handleExportPdf);

    // Set up view mode buttons
    setupViewModeButtons();

    // Set up font size buttons
    setupFontSizeControls();

    // Set up recent files panel
    setupRecentPanel();

    // Set up drag and drop
    setupDragAndDrop();

    // Set up keyboard shortcuts
    setupKeyboardShortcuts();

    // Initial status update
    updateWordCount();
    updatePosition(1, 1);

    // Check if a file was passed via command-line (e.g. "Open with" file association)
    try {
        const startupFile = await getStartupFile();
        if (startupFile) {
            ignoreNextChanges = 2;
            openFileInTab(startupFile.path, startupFile.content);
        }
    } catch (e) {
        // Ignore startup file errors
    }

    // Handle window close via Tauri (replaces Python on_closing / _quillHandleAppClose)
    try {
        const appWindow = getCurrentWindow();
        await appWindow.onCloseRequested(async (event) => {
            event.preventDefault();
            const okToClose = await handleAppClose();
            if (okToClose) {
                const api = await getApi();
                // Don't await — window.destroy() fires before the invoke returns
                api.force_close().catch(() => {});
            }
        });
    } catch (e) {
        // Not in Tauri context (should not happen in production)
    }

    // Handle macOS "Open with" events fired while the app is already running
    try {
        await listen('open-file', (event) => {
            const { path, content } = event.payload;
            openFileInTab(path, content);
        });
    } catch (e) {
        // Not in Tauri context
    }

    // Focus the editor
    setTimeout(() => focus(), 100);
}

/**
 * Handle content changes in the editor.
 */
function handleContentChange(markdown) {
    // Skip marking as modified if we're ignoring changes (after loading)
    if (ignoreNextChanges > 0) {
        ignoreNextChanges--;
        updateWordCount();
        return;
    }
    if (ignoreNextChanges < 0) {
        console.warn('ignoreNextChanges went negative — more change events fired during load than expected');
        ignoreNextChanges = 0;
    }

    const tab = getActiveTab();
    if (tab && !tab.modified) {
        setActiveTabModified(true);
        setModified(true);  // Keep Python in sync
    }
    updateWordCount();

    // Update outline if visible
    if (isOutlineVisible()) {
        updateOutline();
    }

}

/**
 * Handle tab change.
 */
function handleTabChange(tab) {
    // Sync Python state with tab state
    setModified(tab.modified);

    // Update window title via API
    updateWindowTitle(tab);

    // Update word count
    updateWordCount();

    // Sync comments for this tab
    setTabComments(tab.comments || []);
    if ((!tab.comments || !tab.comments.length) && tab.content) {
        parseCommentsFromMarkdown(tab.content);
    }
}

/**
 * Update window title for current tab.
 */
async function updateWindowTitle(tab) {
    const api = await getApi();
    if (api.set_current_file) {
        await api.set_current_file(tab.path);  // null clears Python's title/modified state
    }
}

/**
 * Handle selection/cursor changes.
 */
function handleSelectionChange({ line, col }) {
    updatePosition(line, col);
}

/**
 * Update the word count and reading time in status bar.
 */
function updateWordCount() {
    const content = getSourceContent();
    const count = content && content.trim() ? content.trim().split(/\s+/).length : 0;

    // Update word count
    const wordsEl = document.getElementById('status-words');
    if (wordsEl) {
        wordsEl.textContent = `Words: ${count}`;
    }

    // Update reading time (average 200 words per minute)
    const readingEl = document.getElementById('status-reading-time');
    if (readingEl) {
        const minutes = Math.max(1, Math.ceil(count / 200));
        readingEl.textContent = count > 0 ? `~${minutes} min read` : '~0 min read';
    }
}

/**
 * Update cursor position in status bar.
 */
function updatePosition(line, col) {
    const el = document.getElementById('status-position');
    if (el) {
        el.textContent = `Ln ${line}, Col ${col}`;
    }
}

/**
 * Update status bar for source mode.
 */
function updateSourcePosition() {
    const sourceEditor = document.getElementById('source-editor');
    if (!sourceEditor) return;

    const text = sourceEditor.value;
    const selStart = sourceEditor.selectionStart;
    const textBefore = text.substring(0, selStart);
    const lines = textBefore.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;

    updatePosition(line, col);
}

// ─── Export PDF ─────────────────────────────────────────────────────────

async function handleExportPdf() {
    try {
        showInfo('Generating PDF…');
        const dataB64 = await generatePdfB64();

        const tab = getActiveTab();
        const filename = tab?.path
            ? tab.path.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, '') + '.pdf'
            : 'document.pdf';

        const result = await savePdf(dataB64, filename);
        if (result.success) {
            showSuccess(`PDF saved: ${result.path.replace(/\\/g, '/').split('/').pop()}`);
        }
    } catch (e) {
        showError('PDF export failed: ' + e.message);
    }
}

// ─── Font Size ──────────────────────────────────────────────────────────

function applyFontSize(size) {
    currentFontSize = size;
    document.documentElement.style.setProperty('--editor-font-size', `${size}px`);

    // Apply to editor and source editor
    const editor = document.getElementById('editor');
    const sourceEditor = document.getElementById('source-editor');
    if (editor) editor.style.fontSize = `${size}px`;
    if (sourceEditor) sourceEditor.style.fontSize = `${size}px`;

    // Update label
    const label = document.getElementById('font-size-label');
    if (label) label.textContent = `${size}px`;
}

async function changeFontSize(delta) {
    const newSize = Math.max(8, Math.min(32, currentFontSize + delta));
    if (newSize !== currentFontSize) {
        applyFontSize(newSize);
        await setFontSize(newSize);
    }
}

async function resetFontSize() {
    applyFontSize(14);
    await setFontSize(14);
}

function setupFontSizeControls() {
    const zoomIn = document.getElementById('btn-zoom-in');
    const zoomOut = document.getElementById('btn-zoom-out');

    if (zoomIn) {
        zoomIn.addEventListener('click', () => changeFontSize(2));
    }
    if (zoomOut) {
        zoomOut.addEventListener('click', () => changeFontSize(-2));
    }
}

// ─── View Mode Buttons ──────────────────────────────────────────────────

function setupViewModeButtons() {
    const outlineBtn = document.getElementById('btn-outline');
    const commentsBtn = document.getElementById('btn-comments');

    if (outlineBtn) {
        outlineBtn.addEventListener('click', () => {
            const visible = toggleOutline();
            outlineBtn.classList.toggle('active', visible);
        });
    }

    if (commentsBtn) {
        commentsBtn.addEventListener('click', async () => {
            const visible = toggleCommentPanel();
            commentsBtn.classList.toggle('active', visible);
            if (visible) {
                commentsEnabled = true;
                setCommentsEnabledLocal(true);
                await setCommentsEnabled(true).catch(() => {});
            }
        });
    }

    // Editor right-click context menu for adding comments
    // Use synchronous commentsEnabled check so e.preventDefault() fires before native menu
    const editorEl = document.getElementById('editor');
    if (editorEl) {
        editorEl.addEventListener('contextmenu', (e) => {
            if (!isInSourceMode() && commentsEnabled) {
                e.preventDefault();
                showEditorContextMenu(e.clientX, e.clientY);
            }
        });
    }
}

let editorContextMenu = null;

function showEditorContextMenu(x, y) {
    if (!editorContextMenu) {
        editorContextMenu = document.createElement('div');
        editorContextMenu.className = 'context-menu';
        editorContextMenu.id = 'editor-context-menu';

        const addItem = document.createElement('div');
        addItem.className = 'context-menu-item';
        addItem.textContent = 'Add Comment';
        addItem.addEventListener('click', () => {
            editorContextMenu.classList.remove('visible');
            startNewComment();
        });
        editorContextMenu.appendChild(addItem);
        document.body.appendChild(editorContextMenu);

        document.addEventListener('click', () => {
            editorContextMenu?.classList.remove('visible');
        }, true);
    }

    editorContextMenu.style.left = `${x}px`;
    editorContextMenu.style.top = `${y}px`;
    editorContextMenu.classList.add('visible');

    // Nudge back on-screen
    const r = editorContextMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) editorContextMenu.style.left = `${x - r.width}px`;
    if (r.bottom > window.innerHeight) editorContextMenu.style.top = `${y - r.height}px`;
}

// ─── Recent Files Panel ─────────────────────────────────────────────────

let recentPanelVisible = false;
let selectedRecentItem = null;
let contextMenuTarget = null;

function initContextMenu() {
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.id = 'recent-context-menu';

    const revealItem = document.createElement('div');
    revealItem.className = 'context-menu-item';
    revealItem.textContent = 'Open File Location';
    revealItem.addEventListener('click', async () => {
        if (contextMenuTarget) await revealInFinder(contextMenuTarget);
        hideContextMenu();
    });
    menu.appendChild(revealItem);
    document.body.appendChild(menu);

    document.addEventListener('click', hideContextMenu, true);
    document.addEventListener('contextmenu', (e) => {
        if (!e.target.closest('#recent-context-menu')) hideContextMenu();
    }, true);
}

function showContextMenu(x, y, filePath) {
    let menu = document.getElementById('recent-context-menu');
    if (!menu) { initContextMenu(); menu = document.getElementById('recent-context-menu'); }
    contextMenuTarget = filePath;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('visible');
    // Nudge back on-screen if needed
    const r = menu.getBoundingClientRect();
    if (r.right > window.innerWidth) menu.style.left = `${x - r.width}px`;
    if (r.bottom > window.innerHeight) menu.style.top = `${y - r.height}px`;
}

function hideContextMenu() {
    const menu = document.getElementById('recent-context-menu');
    if (menu) menu.classList.remove('visible');
    contextMenuTarget = null;
}

function setupRecentPanel() {
    const toggleBtn = document.getElementById('btn-recent-panel');
    const closeBtn = document.getElementById('recent-close');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            toggleRecentPanel();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            hideRecentPanel();
        });
    }
}

function toggleRecentPanel() {
    recentPanelVisible = !recentPanelVisible;

    const panel = document.getElementById('recent-panel');
    const toggleBtn = document.getElementById('btn-recent-panel');

    if (recentPanelVisible) {
        panel?.classList.remove('hidden');
        toggleBtn?.classList.add('active');
        populateRecentPanel();
    } else {
        panel?.classList.add('hidden');
        toggleBtn?.classList.remove('active');
        selectedRecentItem = null;
    }
}

function hideRecentPanel() {
    if (recentPanelVisible) {
        toggleRecentPanel();
    }
}

async function populateRecentPanel() {
    const content = document.getElementById('recent-content');
    const panel = document.getElementById('recent-panel');
    if (!content || !panel) return;

    content.innerHTML = '';
    selectedRecentItem = null;

    // Remove any existing clear button
    const existingClear = panel.querySelector('.recent-clear');
    if (existingClear) {
        existingClear.remove();
    }

    try {
        const recentFiles = await getRecentFiles();

        if (!recentFiles || recentFiles.length === 0) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'recent-empty';
            emptyEl.textContent = 'No recent files';
            content.appendChild(emptyEl);
        } else {
            recentFiles.forEach(filePath => {
                const item = document.createElement('div');
                item.className = 'recent-item';
                // Extract filename, handling both / and \ separators
                const parts = filePath.replace(/\\/g, '/').split('/');
                item.textContent = parts[parts.length - 1];
                item.title = filePath;
                item.dataset.path = filePath;

                // Single click: highlight
                item.addEventListener('click', () => {
                    // Remove previous selection
                    content.querySelectorAll('.recent-item.selected').forEach(el => {
                        el.classList.remove('selected');
                    });
                    item.classList.add('selected');
                    selectedRecentItem = filePath;
                });

                // Double click: open in tab (or switch to it)
                item.addEventListener('dblclick', async () => {
                    await handleOpenRecentPanelItem(filePath);
                });

                // Right-click: context menu
                item.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    showContextMenu(e.clientX, e.clientY, filePath);
                });

                content.appendChild(item);
            });

            // Add clear button at the bottom of the panel
            const clearBtn = document.createElement('button');
            clearBtn.className = 'recent-clear';
            clearBtn.textContent = 'Clear Recent';
            clearBtn.addEventListener('click', async () => {
                await clearRecentFiles();
                populateRecentPanel();
            });
            panel.appendChild(clearBtn);
        }
    } catch (e) {
        const errorEl = document.createElement('div');
        errorEl.className = 'recent-empty';
        errorEl.textContent = 'Could not load recent files';
        content.appendChild(errorEl);
    }
}

async function handleOpenRecentPanelItem(filePath) {
    // Check if already open in a tab
    const existingTab = getTabByPath(filePath);
    if (existingTab) {
        switchToTab(existingTab.id);
        focus();
        return;
    }

    // Open via the bridge
    const result = await openRecentFile(filePath);
    if (result.success) {
        openFileInTab(result.path, result.content);
    } else if (result.error) {
        showError(result.error);
        // Rust already pruned missing files from the list — refresh to reflect it
        populateRecentPanel();
    }

    focus();
}

// ─── Drag and Drop ──────────────────────────────────────────────────────

function setupDragAndDrop() {
    const body = document.body;

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        body.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    // Visual feedback for drag over
    ['dragenter', 'dragover'].forEach(eventName => {
        body.addEventListener(eventName, () => {
            body.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        body.addEventListener(eventName, () => {
            body.classList.remove('drag-over');
        }, false);
    });

    // Handle file drop
    body.addEventListener('drop', async (e) => {
        const files = e.dataTransfer.files;
        if (files.length === 0) return;

        const file = files[0];

        // Check if it's a markdown or text file
        const validExtensions = ['.md', '.markdown', '.txt'];
        const fileName = file.name.toLowerCase();
        const isValid = validExtensions.some(ext => fileName.endsWith(ext));

        if (!isValid) {
            showError('Please drop a Markdown (.md) or text file.');
            return;
        }

        // Read the file content using FileReader
        const reader = new FileReader();
        reader.onload = async (event) => {
            const content = event.target.result;
            // PyWebView provides file.path for local files
            const filePath = file.path || null;
            const fileName = file.name;

            // Check if current tab is blank (empty and unmodified)
            const activeTab = getActiveTab();
            const currentContent = getSourceContent();
            const isBlank = !activeTab.modified && (!currentContent || currentContent.trim() === '');

            if (isBlank) {
                // Replace current blank tab with the opened file
                ignoreNextChanges = 2;  // Prevent false dirty flag
                setSourceContent(content);
                setActiveTabPath(filePath, fileName);
                if (filePath) {
                    await setCurrentFile(filePath);
                }
            } else {
                // Open in new tab (tabs.js handles the loading flag)
                openFileInTab(filePath, content, fileName);
            }

            focus();
        };
        reader.onerror = () => {
            showError('Error reading file.');
        };
        reader.readAsText(file);
    }, false);
}

// ─── Keyboard Shortcuts ─────────────────────────────────────────────────

function setupKeyboardShortcuts() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? 'metaKey' : 'ctrlKey';

    // Use capture phase to handle shortcuts before ProseMirror
    document.addEventListener('keydown', async (e) => {
        // Alt+Z for word wrap toggle (works without modifier key)
        if (e.altKey && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            e.stopPropagation();
            handleWordWrapToggle();
            // Save word wrap preference
            const api = await getApi();
            if (api.toggle_word_wrap) {
                await api.toggle_word_wrap();
            }
            return;
        }

        // Only handle if modifier key is pressed
        if (!e[modKey]) return;

        const key = e.key.toLowerCase();

        // Handle Shift+ combinations
        if (e.shiftKey) {
            if (key === 'k' && !isInSourceMode()) {
                e.preventDefault();
                e.stopPropagation();
                if (commentsEnabled) startNewComment();
                return;
            }
            if (key === 's') {
                e.preventDefault();
                e.stopPropagation();
                const content = getSourceContent();
                const api = await getApi();
                const result = await api.save_file_as(content);
                if (result.success) {
                    clearModified();
                    await setModified(false);
                    setActiveTabPath(result.path);
                }
                return;
            }
            if (key === 'x' && !isInSourceMode()) {
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('btn-strike').click();
                return;
            }
            if (key === 'c' && !isInSourceMode()) {
                e.preventDefault();
                e.stopPropagation();
                handleCodeBlock();
                return;
            }
            if (key === 'g') {
                e.preventDefault();
                e.stopPropagation();
                findPrev();
                return;
            }
            if ((key === '8' || key === '*') && !isInSourceMode()) {
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('btn-bullet').click();
                return;
            }
        }

        switch (key) {
            case 's':
                e.preventDefault();
                e.stopPropagation();
                await handleSave();
                break;

            case 'n':
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('btn-new').click();
                break;

            case 'o':
                e.preventDefault();
                e.stopPropagation();
                document.getElementById('btn-open').click();
                break;

            case 'b':
                if (!isInSourceMode()) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById('btn-bold').click();
                }
                break;

            case 'i':
                if (!isInSourceMode()) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById('btn-italic').click();
                }
                break;

            case 'k':
                if (!isInSourceMode()) {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById('btn-link').click();
                }
                break;

            case '1':
            case '2':
            case '3':
                if (!isInSourceMode()) {
                    e.preventDefault();
                    e.stopPropagation();
                    const level = parseInt(key);
                    document.getElementById(`btn-h${level}`).click();
                }
                break;

            case '=':
            case '+':
                e.preventDefault();
                e.stopPropagation();
                changeFontSize(2);
                break;

            case '-':
                e.preventDefault();
                e.stopPropagation();
                changeFontSize(-2);
                break;

            case '0':
                e.preventDefault();
                e.stopPropagation();
                resetFontSize();
                break;

            case 'p':
                e.preventDefault();
                e.stopPropagation();
                handleExportPdf();
                break;

            case 'f':
                e.preventDefault();
                e.stopPropagation();
                showFindBar(false);
                break;

            case 'g':
                e.preventDefault();
                e.stopPropagation();
                findNext();
                break;

            case 'h':
                e.preventDefault();
                e.stopPropagation();
                showFindBar(true);  // Open in replace mode
                break;

            case 'w':
                e.preventDefault();
                e.stopPropagation();
                closeActiveTab();
                break;

            case 't':
                if (e.shiftKey) {
                    // Cmd+Shift+T could reopen closed tab (not implemented)
                } else {
                    e.preventDefault();
                    e.stopPropagation();
                    newTab();
                }
                break;

            case 'tab':
                // Cmd+Tab or Ctrl+Tab to switch tabs
                e.preventDefault();
                e.stopPropagation();
                if (e.shiftKey) {
                    prevTab();
                } else {
                    nextTab();
                }
                break;
        }
    }, true); // capture phase
}

// ─── Tooltips ───────────────────────────────────────────────────────────

function setupTooltips() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const mod = isMac ? '⌘' : 'Ctrl+';
    const shift = isMac ? '⇧' : 'Shift+';

    // Build tooltip text and set data-title (read by CSS ::after) + aria-label.
    // Only process .toolbar-btn elements; dropdown items are text and don't need tooltips.
    document.querySelectorAll('.toolbar-btn[data-tooltip]').forEach(el => {
        const label = el.getAttribute('data-tooltip');
        const shortcut = el.getAttribute('data-shortcut');
        let text;

        if (shortcut) {
            let formattedShortcut;
            if (shortcut.startsWith('shift+')) {
                formattedShortcut = shift + shortcut.slice(6).toUpperCase();
            } else {
                formattedShortcut = shortcut.toUpperCase();
            }
            text = `${label}  ${mod}${formattedShortcut}`;
        } else {
            text = label;
        }

        el.setAttribute('data-title', text);
        el.setAttribute('aria-label', label);
    });

    // Status bar zoom buttons use native title (not toolbar-btn, no CSS tooltip)
    const zoomIn = document.getElementById('btn-zoom-in');
    const zoomOut = document.getElementById('btn-zoom-out');
    if (zoomIn) zoomIn.title = `Zoom In (${mod}+)`;
    if (zoomOut) zoomOut.title = `Zoom Out (${mod}-)`;
}

// (Close handling and macOS file-open events are registered in init() via Tauri APIs)

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupTooltips();
        init();
    });
} else {
    setupTooltips();
    init();
}

