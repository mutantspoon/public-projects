/**
 * Toast notification system for Quill.
 */

const TOAST_DURATION = 4000;

/**
 * Show a toast notification.
 * @param {string} message - The message to display
 * @param {'success' | 'error' | 'info'} type - The toast type
 * @param {number} duration - How long to show (ms)
 */
export function showToast(message, type = 'info', duration = TOAST_DURATION) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-message">${escapeHtml(message)}</span>
        <button class="toast-close" aria-label="Close">&times;</button>
    `;

    // Close button handler
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Auto remove after duration
    setTimeout(() => {
        removeToast(toast);
    }, duration);

    return toast;
}

/**
 * Remove a toast with animation.
 */
function removeToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => {
        toast.remove();
    }, 300);
}

/**
 * Show a success toast.
 */
export function showSuccess(message, duration) {
    return showToast(message, 'success', duration);
}

/**
 * Show an error toast.
 */
export function showError(message, duration) {
    return showToast(message, 'error', duration);
}

/**
 * Show an info toast.
 */
export function showInfo(message, duration) {
    return showToast(message, 'info', duration);
}

/**
 * Escape HTML to prevent XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
