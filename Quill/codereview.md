# Code Review Findings

External review dated Feb 2025. Actionable items extracted below.

## High Priority

### 1. ~~Resize/Move Event Spamming Disk I/O~~ ✓ FIXED
**File:** `src/window.py`

Made `on_moved` and `on_resized` no-op. `on_closing` saves final geometry.

### 2. ~~Dead Code: `src/themes.py`~~ ✓ FIXED
File was already deleted. Theme CSS variables are in `ui/css/themes.css`.

---

## Low Priority

### 3. ~~Large File Handling~~ ✓ FIXED
**File:** `src/api.py`

Added file size check in `open_file()` and `open_recent_file()`. Files > 10MB return error message with actual size.

### 4. ~~Encoding Hardcoding~~ ✓ FIXED
**File:** `src/api.py`

Now tries UTF-8 first, falls back to latin-1 on `UnicodeDecodeError`. Applied to both `open_file()` and `open_recent_file()`.

---

## Already Handled

- `.gitignore` already excludes `__pycache__/`, `venv/`, etc.
- Architecture and code quality rated highly (8-9/10)
