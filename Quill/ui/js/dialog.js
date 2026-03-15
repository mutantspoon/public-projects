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
 * Prompt the user for a comment note.
 * @param {string} placeholder - Placeholder text for the textarea
 * @returns {Promise<string|null>} - The note text or null if cancelled
 */
export function promptForNote(placeholder = 'Enter comment...') {
    return new Promise((resolve) => {
        const overlay = document.getElementById('modal-overlay');
        const messageEl = document.getElementById('modal-message');
        const buttonsEl = document.getElementById('modal-buttons');

        // Replace message element with a textarea
        messageEl.innerHTML = '';
        const label = document.createElement('div');
        label.style.cssText = 'font-size:13px;color:var(--text);opacity:0.8;margin-bottom:10px;';
        label.textContent = placeholder;
        const textarea = document.createElement('textarea');
        textarea.style.cssText = 'width:100%;height:80px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--background);color:var(--text);font-size:13px;resize:none;outline:none;font-family:inherit;';
        textarea.placeholder = 'Add your note here...';
        textarea.maxLength = 2000;
        messageEl.appendChild(label);
        messageEl.appendChild(textarea);

        buttonsEl.innerHTML = '';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'modal-btn';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', () => {
            cleanup();
            resolve(null);
        });

        const addBtn = document.createElement('button');
        addBtn.className = 'modal-btn primary';
        addBtn.textContent = 'Add Comment';
        addBtn.addEventListener('click', () => {
            const note = textarea.value.trim();
            cleanup();
            resolve(note || null);
        });

        buttonsEl.appendChild(cancelBtn);
        buttonsEl.appendChild(addBtn);

        overlay.classList.remove('hidden');
        setTimeout(() => textarea.focus(), 50);

        function cleanup() {
            overlay.classList.add('hidden');
            // Restore original message element content
            messageEl.innerHTML = '';
        }

        // Allow Enter to submit (Shift+Enter for newline)
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addBtn.click();
            } else if (e.key === 'Escape') {
                cancelBtn.click();
            }
        });
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
