/**
 * Python-JavaScript bridge communication layer.
 * Provides a clean interface to the PyWebView API.
 */

// Check if we're running in PyWebView
const isWebView = () => typeof pywebview !== 'undefined' && pywebview.api;

// Wait for PyWebView API to be ready
export function waitForApi() {
    return new Promise((resolve) => {
        // Already available
        if (isWebView()) {
            resolve(pywebview.api);
            return;
        }

        // Listen for PyWebView's ready event (official method)
        const onReady = () => {
            window.removeEventListener('pywebviewready', onReady);
            clearTimeout(timeout);
            clearInterval(poll);
            if (isWebView()) {
                resolve(pywebview.api);
            } else {
                resolve(createMockApi());
            }
        };
        window.addEventListener('pywebviewready', onReady);

        // Also poll as fallback (some pywebview versions)
        const poll = setInterval(() => {
            if (isWebView()) {
                clearInterval(poll);
                clearTimeout(timeout);
                window.removeEventListener('pywebviewready', onReady);
                resolve(pywebview.api);
            }
        }, 50);

        // Timeout after 10 seconds (fallback to mock API for development)
        const timeout = setTimeout(() => {
            clearInterval(poll);
            window.removeEventListener('pywebviewready', onReady);
            console.warn('PyWebView API not available, using mock API');
            resolve(createMockApi());
        }, 10000);
    });
}

// Mock API for development/testing in browser
function createMockApi() {
    let mockContent = '';
    let mockTheme = 'dark';
    let mockFontSize = 14;
    let mockModified = false;
    let mockFilePath = null;
    let mockRecentFiles = [];

    return {
        new_file: async () => {
            mockFilePath = null;
            mockModified = false;
            return { success: true, content: '' };
        },

        open_file: async () => {
            return { success: false, cancelled: true };
        },

        save_file: async (content) => {
            mockContent = content;
            mockModified = false;
            return { success: true, path: mockFilePath || 'Untitled.md' };
        },

        save_file_as: async (content) => {
            mockContent = content;
            mockModified = false;
            mockFilePath = 'Untitled.md';
            return { success: true, path: 'Untitled.md' };
        },

        get_settings: async () => ({
            theme: mockTheme,
            font_size: mockFontSize,
            word_wrap: true,
        }),

        get_theme: async () => mockTheme,

        set_theme: async (theme) => {
            mockTheme = theme;
            return { success: true, theme };
        },

        set_font_size: async (size) => {
            mockFontSize = Math.max(8, Math.min(32, size));
            return { success: true, font_size: mockFontSize };
        },

        set_modified: async (modified) => {
            mockModified = modified;
        },

        get_file_state: async () => ({
            path: mockFilePath,
            modified: mockModified,
            filename: mockFilePath ? mockFilePath.split('/').pop() : 'Untitled',
        }),

        get_recent_files: async () => mockRecentFiles,

        open_recent_file: async (filePath) => {
            return { success: false, error: 'Mock API' };
        },

        clear_recent_files: async () => {
            mockRecentFiles = [];
        },

        set_current_file: async (filePath) => {
            mockFilePath = filePath;
            mockModified = false;
            return { success: true, path: filePath };
        },

        toggle_word_wrap: async () => {
            const mockWordWrap = true; // Mock state
            return { success: true, word_wrap: !mockWordWrap };
        },

        get_startup_file: async () => null,
    };
}

// Singleton API instance
let apiInstance = null;

export async function getApi() {
    if (!apiInstance) {
        apiInstance = await waitForApi();
    }
    return apiInstance;
}

// Convenience wrapper functions
export async function newFile() {
    const api = await getApi();
    return api.new_file();
}

export async function openFile() {
    const api = await getApi();
    return api.open_file();
}

export async function saveFile(content) {
    const api = await getApi();
    return api.save_file(content);
}

export async function saveFileAs(content) {
    const api = await getApi();
    return api.save_file_as(content);
}

export async function getSettings() {
    const api = await getApi();
    return api.get_settings();
}

export async function getTheme() {
    const api = await getApi();
    return api.get_theme();
}

export async function setTheme(theme) {
    const api = await getApi();
    return api.set_theme(theme);
}

export async function setModified(modified) {
    const api = await getApi();
    return api.set_modified(modified);
}

export async function getFileState() {
    const api = await getApi();
    return api.get_file_state();
}

export async function setFontSize(size) {
    const api = await getApi();
    return api.set_font_size(size);
}

export async function getRecentFiles() {
    const api = await getApi();
    return api.get_recent_files();
}

export async function openRecentFile(filePath) {
    const api = await getApi();
    return api.open_recent_file(filePath);
}

export async function clearRecentFiles() {
    const api = await getApi();
    return api.clear_recent_files();
}

export async function setCurrentFile(filePath) {
    const api = await getApi();
    return api.set_current_file(filePath);
}

export async function getStartupFile() {
    const api = await getApi();
    return api.get_startup_file();
}
