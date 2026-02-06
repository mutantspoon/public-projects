# CLAUDE.md

## Project Overview

**Quill** - A lightweight, cross-platform WYSIWYG markdown editor built with PyWebView and Milkdown.

## Tech Stack

- **GUI**: PyWebView (native OS WebView)
- **Editor**: Milkdown (WYSIWYG markdown editor)
- **Build**: esbuild (JavaScript bundling)
- **Distribution**: PyInstaller (Windows), py2app (macOS)

## Architecture

```
┌─────────────────────────────────────────────┐
│  PyWebView Window (Native OS WebView)       │
│  ┌───────────────────────────────────────┐  │
│  │  HTML/CSS/JS UI                       │  │
│  │  ┌─────────────────────────────────┐  │  │
│  │  │  Toolbar (HTML)                 │  │  │
│  │  ├─────────────────────────────────┤  │  │
│  │  │  Milkdown Editor                │  │  │
│  │  │  (WYSIWYG Markdown)             │  │  │
│  │  ├─────────────────────────────────┤  │  │
│  │  │  Status Bar (HTML)              │  │  │
│  │  └─────────────────────────────────┘  │  │
│  └───────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
        ↕ JavaScript API Bridge
┌─────────────────────────────────────────────┐
│  Python Backend                             │
│  - File operations (open, save)             │
│  - Settings management                      │
│  - Window management                        │
│  - Native dialogs                           │
└─────────────────────────────────────────────┘
```

## Project Structure

```
Quill/
├── main.py              # Entry point
├── requirements.txt     # Python deps (pywebview)
├── src/
│   ├── api.py           # Python API exposed to JS
│   ├── window.py        # Window management
│   ├── settings.py      # Settings persistence
│   └── themes.py        # Theme definitions + CSS export
├── ui/
│   ├── index.html       # Main HTML shell
│   ├── css/
│   │   ├── app.css      # App styles
│   │   └── themes.css   # Light/dark theme variables
│   ├── js/
│   │   ├── app.js       # Main JS entry
│   │   ├── editor.js    # Milkdown setup
│   │   ├── toolbar.js   # Toolbar logic
│   │   ├── bridge.js    # Python-JS communication
│   │   └── bundle.js    # Built bundle (generated)
│   └── package.json     # Milkdown dependencies
└── assets/
```

## Key Shortcuts

| Action | macOS | Windows |
|--------|-------|---------|
| Save | Cmd+S | Ctrl+S |
| Save As | Cmd+Shift+S | Ctrl+Shift+S |
| New | Cmd+N | Ctrl+N |
| Open | Cmd+O | Ctrl+O |
| Bold | Cmd+B | Ctrl+B |
| Italic | Cmd+I | Ctrl+I |
| Link | Cmd+K | Ctrl+K |
| Strikethrough | Cmd+Shift+X | Ctrl+Shift+X |
| Heading 1-3 | Cmd+1/2/3 | Ctrl+1/2/3 |
| Toggle Source | Cmd+/ | Ctrl+/ |

## Color Schemes

**Light**: bg #FFFFFF, text #1A1A1A, accent #0066CC
**Dark**: bg #1E1E1E, text #D4D4D4, accent #4FC3F7

## Development

```bash
# Setup Python
python -m venv venv
source venv/bin/activate  # macOS
venv\Scripts\activate     # Windows
pip install -r requirements.txt

# Setup JS (first time only)
cd ui
npm install
npm run build

# Run app
python main.py

# Watch mode for JS development
cd ui && npm run watch
```

## Python-JS Bridge

Python functions are exposed via `pywebview.api`:

```javascript
// JS side - calling Python
const result = await pywebview.api.open_file();
if (result.success) {
    editor.setContent(result.content);
}
```

```python
# Python side - API class
class Api:
    def open_file(self):
        # Show native dialog, return file content
        return {"success": True, "content": "..."}
```

## Building Quill.exe (PyInstaller)

```bash
cd Quill
venv\Scripts\pyinstaller -y --onedir --windowed --name Quill --add-data "ui;ui" --add-data "src;src" main.py
```

Output: `dist/Quill/Quill.exe`. PyInstaller is installed in the venv (not in requirements.txt).

## File Association ("Open with" for .md files)

Quill supports opening `.md` files via Windows "Open with". Key implementation details:

1. **CWD Fix**: `main.py` sets `os.chdir()` to the exe directory when frozen, because Windows sets CWD to the file's directory during "Open with", breaking pywebview's DLL loading.

2. **WebView2 Storage**: `window.py` sets `storage_path` to `%APPDATA%/Quill/webview` to avoid permission issues with WebView2 cache.

3. **File Loading**: Uses Python's `evaluate_js()` on the `loaded` event to call JS directly, bypassing `pywebviewready` timing issues. A 300ms delay prevents UI thread conflicts during window operations.
