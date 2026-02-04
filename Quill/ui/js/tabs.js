/**
 * Multi-tab support for Quill editor.
 * Manages tab state, switching, and UI.
 */

import { getContent, setContent, focus } from './editor.js';
import { setModified } from './bridge.js';
import { showSaveDialog } from './dialog.js';

// Tab state
let tabs = [];
let activeTabId = null;
let nextTabId = 1;

// Callbacks for integration
let onTabChange = null;
let onContentRequest = null;
let getIsModifiedCallback = null;
let clearModifiedCallback = null;
let setLoadingContentCallback = null;
let saveCallback = null;

/**
 * Initialize tabs module with callbacks.
 */
export function initTabs(callbacks = {}) {
    onTabChange = callbacks.onTabChange;
    onContentRequest = callbacks.onContentRequest;
    getIsModifiedCallback = callbacks.getIsModified || (() => false);
    clearModifiedCallback = callbacks.clearModified || (() => {});
    setLoadingContentCallback = callbacks.setLoadingContent || (() => {});
    saveCallback = callbacks.onSave || (async () => false);

    // Create initial untitled tab
    createTab();

    // Set up tab bar event listeners
    setupTabBarEvents();

    // Render initial state
    renderTabs();
}

/**
 * Create a new tab.
 */
export function createTab(options = {}) {
    const { path = null, content = '', modified = false, activate = true, filename = null } = options;

    const tab = {
        id: nextTabId++,
        path,
        content,
        modified,
        filename: filename || (path ? path.split('/').pop() : 'Untitled'),
    };

    tabs.push(tab);

    if (activate) {
        switchToTab(tab.id);
    }

    renderTabs();
    return tab;
}

/**
 * Switch to a specific tab.
 */
export function switchToTab(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Save current tab's content before switching
    if (activeTabId !== null) {
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab) {
            currentTab.content = onContentRequest ? onContentRequest() : getContent();
            currentTab.modified = getIsModifiedCallback();
        }
    }

    // Switch to new tab
    activeTabId = tabId;

    // Load new tab's content (ignore next change events to prevent false dirty flag)
    setLoadingContentCallback(true);
    setContent(tab.content);

    // Update modified state
    if (tab.modified) {
        setModified(true);
    } else {
        clearModifiedCallback();
        setModified(false);
    }

    // Notify listeners
    if (onTabChange) {
        onTabChange(tab);
    }

    renderTabs();
    focus();
}

/**
 * Close a tab.
 */
export async function closeTab(tabId, force = false) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return false;

    const tab = tabs[tabIndex];

    // Check for unsaved changes
    if (!force && tab.modified) {
        const result = await showSaveDialog(tab.filename);

        if (result === 'cancel') {
            return false;
        }

        if (result === 'save') {
            // Save the file first
            const saved = await saveCallback();
            if (!saved) {
                return false;  // Save failed or was cancelled
            }
        }
        // 'discard' falls through to close
    }

    // Remove the tab
    tabs.splice(tabIndex, 1);

    // If we closed the active tab, switch to another
    if (activeTabId === tabId) {
        if (tabs.length === 0) {
            // Create a new untitled tab if all tabs are closed
            createTab();
        } else {
            // Switch to the nearest tab
            const newIndex = Math.min(tabIndex, tabs.length - 1);
            switchToTab(tabs[newIndex].id);
        }
    }

    renderTabs();
    return true;
}

/**
 * Close the active tab.
 */
export async function closeActiveTab() {
    if (activeTabId !== null) {
        return await closeTab(activeTabId);
    }
    return false;
}

/**
 * Get the active tab.
 */
export function getActiveTab() {
    return tabs.find(t => t.id === activeTabId) || null;
}

/**
 * Get all tabs with synced content.
 */
export function getAllTabs() {
    // Sync active tab's content before returning
    if (activeTabId !== null && onContentRequest) {
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
            activeTab.content = onContentRequest();
        }
    }
    return [...tabs];
}

/**
 * Update the active tab's content and modified state.
 */
export function updateActiveTabContent(content) {
    const tab = getActiveTab();
    if (tab) {
        tab.content = content;
    }
}

/**
 * Set the active tab's modified state.
 */
export function setActiveTabModified(modified) {
    const tab = getActiveTab();
    if (tab) {
        tab.modified = modified;
        renderTabs();
    }
}

/**
 * Set the active tab's file path.
 */
export function setActiveTabPath(path, filename = null) {
    const tab = getActiveTab();
    if (tab) {
        tab.path = path;
        tab.filename = filename || (path ? path.split('/').pop() : 'Untitled');
        renderTabs();
    }
}

/**
 * Check if the active tab path matches the given path.
 */
export function isFileOpen(path) {
    return tabs.some(t => t.path === path);
}

/**
 * Get tab by file path.
 */
export function getTabByPath(path) {
    return tabs.find(t => t.path === path) || null;
}

/**
 * Open a file in a new tab or switch to existing tab.
 */
export function openFileInTab(path, content, filename = null) {
    // Only check for existing tab if we have a valid path
    if (path) {
        const existingTab = getTabByPath(path);
        if (existingTab) {
            switchToTab(existingTab.id);
            return existingTab;
        }
    }

    // Create new tab for the file
    return createTab({ path, content, modified: false, filename });
}

/**
 * Create a new untitled tab (for Cmd+N).
 */
export function newTab() {
    return createTab();
}

/**
 * Switch to the next tab.
 */
export function nextTab() {
    if (tabs.length <= 1) return;

    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    switchToTab(tabs[nextIndex].id);
}

/**
 * Switch to the previous tab.
 */
export function prevTab() {
    if (tabs.length <= 1) return;

    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    switchToTab(tabs[prevIndex].id);
}

// ─── UI Rendering ────────────────────────────────────────────────────────

/**
 * Render the tab bar.
 */
function renderTabs() {
    const tabBar = document.getElementById('tab-bar');
    if (!tabBar) return;

    const tabsContainer = tabBar.querySelector('.tabs-container');
    if (!tabsContainer) return;

    // Clear existing tabs (except the new tab button)
    tabsContainer.innerHTML = '';

    // Render each tab
    tabs.forEach(tab => {
        const tabEl = document.createElement('div');
        tabEl.className = `tab ${tab.id === activeTabId ? 'active' : ''}`;
        tabEl.dataset.tabId = tab.id;

        const titleEl = document.createElement('span');
        titleEl.className = 'tab-title';
        titleEl.textContent = tab.filename + (tab.modified ? '*' : '');
        titleEl.title = tab.path || 'Untitled';

        const closeEl = document.createElement('button');
        closeEl.className = 'tab-close';
        closeEl.innerHTML = '×';
        closeEl.title = 'Close tab';
        closeEl.addEventListener('click', (e) => {
            e.stopPropagation();
            closeTab(tab.id);
        });

        tabEl.appendChild(titleEl);
        tabEl.appendChild(closeEl);

        tabEl.addEventListener('click', () => {
            switchToTab(tab.id);
        });

        tabsContainer.appendChild(tabEl);
    });

    // Add the new tab button
    const newTabBtn = document.createElement('button');
    newTabBtn.className = 'tab-new';
    newTabBtn.innerHTML = '+';
    newTabBtn.title = 'New tab';
    newTabBtn.addEventListener('click', () => {
        newTab();
    });
    tabsContainer.appendChild(newTabBtn);
}

/**
 * Set up tab bar event listeners.
 */
function setupTabBarEvents() {
    // Prevent tab bar buttons from stealing focus
    const tabBar = document.getElementById('tab-bar');
    if (tabBar) {
        tabBar.addEventListener('mousedown', (e) => {
            if (e.target.closest('.tab') || e.target.closest('.tab-new')) {
                e.preventDefault();
            }
        });
    }
}

/**
 * Clear all tabs and reset state.
 */
export function clearAllTabs() {
    tabs = [];
    activeTabId = null;
    nextTabId = 1;
    createTab();
}

/**
 * Restore tabs from saved drafts.
 * @param {Array} drafts - Array of draft objects
 */
export function restoreTabsFromDrafts(drafts) {
    if (!drafts || drafts.length === 0) return false;

    // Clear existing tabs without creating a new one
    tabs = [];
    activeTabId = null;

    // Restore each draft as a tab
    drafts.forEach((draft, index) => {
        const tab = {
            id: nextTabId++,
            path: draft.path,
            content: draft.content || '',
            modified: draft.modified || false,
            filename: draft.filename || (draft.path ? draft.path.split('/').pop() : 'Untitled'),
        };
        tabs.push(tab);

        // Activate first tab
        if (index === 0) {
            activeTabId = tab.id;
            setContent(tab.content);
        }
    });

    renderTabs();
    return true;
}

/**
 * Check for dirty tabs and prompt to save before app close.
 * @returns {Promise<boolean>} - true if ok to close, false if cancelled
 */
