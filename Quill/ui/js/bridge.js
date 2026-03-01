/**
 * Tauri bridge — replaces the PyWebView bridge.
 * All backend calls go through Tauri's invoke() to Rust commands.
 */

import { invoke } from '@tauri-apps/api/core';

// ─── File Operations ───────────────────────────────────────────────────────────

export async function newFile() {
    return invoke('new_file');
}

export async function openFile() {
    return invoke('open_file');
}

export async function openRecentFile(filePath) {
    return invoke('open_recent_file', { path: filePath });
}

export async function saveFile(content) {
    return invoke('save_file', { content });
}

export async function saveFileAs(content) {
    return invoke('save_file_as', { content });
}

export async function setCurrentFile(filePath) {
    return invoke('set_current_file', { path: filePath });
}

export async function getFileState() {
    return invoke('get_file_state');
}

export async function setModified(modified) {
    return invoke('set_modified', { modified });
}

// ─── Recent Files ──────────────────────────────────────────────────────────────

export async function getRecentFiles() {
    return invoke('get_recent_files');
}

export async function clearRecentFiles() {
    return invoke('clear_recent_files');
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getSettings() {
    return invoke('get_settings');
}

export async function getTheme() {
    const settings = await invoke('get_settings');
    return settings.theme;
}

export async function setTheme(theme) {
    return invoke('set_theme', { theme });
}

export async function setFontSize(size) {
    return invoke('set_font_size', { size });
}

export async function toggleWordWrap() {
    return invoke('toggle_word_wrap');
}

export async function setWordWrap(enabled) {
    return invoke('set_word_wrap', { enabled });
}

// ─── App Lifecycle ────────────────────────────────────────────────────────────

export async function getStartupFile() {
    return invoke('get_startup_file');
}

export async function forceClose() {
    return invoke('force_close');
}

// ─── Compatibility shim ───────────────────────────────────────────────────────
// app.js calls getApi() in a few places and uses api.method() directly.
// Return a plain object delegating to the invoke-based functions above
// so those call sites need no changes.

export async function getApi() {
    return {
        set_current_file: setCurrentFile,
        toggle_word_wrap: toggleWordWrap,
        save_file_as: saveFileAs,
        force_close: forceClose,
    };
}
