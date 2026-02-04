/**
 * Modal dialog system for Quill.
 */

/**
 * Show a modal dialog with custom buttons.
 * @param {string} message - The message to display
 * @param {Array} buttons - Array of {label, value, primary?} objects
 * @returns {Promise<any>} - Resolves with the clicked button's value
 */
export function showDialog(message, buttons) {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const messageEl = document.getElementById('modal-message');
        const buttonsEl = document.getElementById('modal-buttons');

        messageEl.textContent = message;
        buttonsEl.innerHTML = '';

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.className = 'modal-btn' + (btn.primary ? ' primary' : '');
            button.textContent = btn.label;
            button.addEventListener('click', () => {
                overlay.classList.add('hidden');
                resolve(btn.value);
            });
            buttonsEl.appendChild(button);
        });

        overlay.classList.remove('hidden');

        // Focus the primary button or first button
        const primaryBtn = buttonsEl.querySelector('.modal-btn.primary') || buttonsEl.querySelector('.modal-btn');
        if (primaryBtn) primaryBtn.focus();
    });
}

/**
 * Show a save changes dialog.
 * @param {string} filename - The filename to show
 * @returns {Promise<'save'|'discard'|'cancel'>}
 */
export function showSaveDialog(filename) {
    return showDialog(
        `Do you want to save changes to "${filename}"?`,
        [
            { label: 'Cancel', value: 'cancel' },
            { label: 'Don\'t Save', value: 'discard' },
            { label: 'Save', value: 'save', primary: true },
        ]
    );
}
