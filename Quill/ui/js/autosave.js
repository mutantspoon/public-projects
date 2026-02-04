/**
 * Autosave and draft recovery for Quill.
 * Saves drafts to localStorage to prevent data loss.
 */

const AUTOSAVE_INTERVAL = 30000; // 30 seconds
const DRAFT_KEY = 'quill_drafts';

let autosaveTimer = null;
let getContentCallback = null;
let getTabsCallback = null;

/**
 * Initialize autosave system.
 */
export function initAutosave(callbacks = {}) {
    getContentCallback = callbacks.getContent;
    getTabsCallback = callbacks.getTabs;

    // Start autosave timer
    startAutosave();

    // Save on page unload
    window.addEventListener('beforeunload', saveDrafts);
}

/**
 * Start the autosave timer.
 */
function startAutosave() {
    if (autosaveTimer) {
        clearInterval(autosaveTimer);
    }
    autosaveTimer = setInterval(saveDrafts, AUTOSAVE_INTERVAL);
}

/**
 * Stop autosave.
 */
export function stopAutosave() {
    if (autosaveTimer) {
        clearInterval(autosaveTimer);
        autosaveTimer = null;
    }
}

/**
 * Save all drafts to localStorage.
 */
export function saveDrafts() {
    if (!getTabsCallback) return;

    try {
        const tabs = getTabsCallback();
        const drafts = tabs.map(tab => ({
            id: tab.id,
            path: tab.path,
            content: tab.content,
            modified: tab.modified,
            filename: tab.filename,
        }));

        localStorage.setItem(DRAFT_KEY, JSON.stringify({
            timestamp: Date.now(),
            drafts,
        }));
    } catch (e) {
        console.error('Error saving drafts:', e);
    }
}

/**
 * Load saved drafts from localStorage.
 * @returns {Array|null} Array of draft objects or null if none
 */
export function loadDrafts() {
    try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (!saved) return null;

        const data = JSON.parse(saved);

        // Check if drafts are too old (24 hours)
        const age = Date.now() - data.timestamp;
        if (age > 24 * 60 * 60 * 1000) {
            clearDrafts();
            return null;
        }

        return data.drafts;
    } catch (e) {
        console.error('Error loading drafts:', e);
        return null;
    }
}

/**
 * Check if there are recoverable drafts.
 */
export function hasRecoverableDrafts() {
    const drafts = loadDrafts();
    if (!drafts || drafts.length === 0) return false;

    // Check if any draft has content
    return drafts.some(d => d.content && d.content.trim().length > 0);
}

/**
 * Clear all saved drafts.
 */
export function clearDrafts() {
    try {
        localStorage.removeItem(DRAFT_KEY);
    } catch (e) {
        console.error('Error clearing drafts:', e);
    }
}

/**
 * Get draft age as human-readable string.
 */
export function getDraftAge() {
    try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (!saved) return null;

        const data = JSON.parse(saved);
        const age = Date.now() - data.timestamp;

        if (age < 60000) return 'just now';
        if (age < 3600000) return `${Math.floor(age / 60000)} minutes ago`;
        if (age < 86400000) return `${Math.floor(age / 3600000)} hours ago`;
        return `${Math.floor(age / 86400000)} days ago`;
    } catch (e) {
        return null;
    }
}
