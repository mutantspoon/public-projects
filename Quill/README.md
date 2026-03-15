# Quill

A lightweight, native markdown editor for macOS and Windows.

![Quill Dark Mode](assets/mockup_dark.png)

## Features

* **WYSIWYG Editing** - Write in rich text, output clean Markdown

* **AI Comment Review** - Select text, add an instruction, let the AI rewrite it — review changes before committing

* **Multi-Tab Support** - Work on multiple documents at once

* **Find & Replace** - Search and replace text with case-sensitivity option

* **Document Outline** - Navigate long documents via heading hierarchy

* **Source Mode** - Toggle between WYSIWYG and raw Markdown view

* **Export PDF** - Export documents to PDF

* **Dark/Light Themes** - Easy on the eyes, day or night

* **Autosave & Draft Recovery** - Never lose your work

* **Recent Files** - Quick access to recently opened documents

## AI Comment Review

Quill includes an AI-powered review workflow that uses comments you add to the document. The AI reads these comments and can revise the document accordingly.

1. Select text in the editor
2. Press **Cmd+Shift+K** (or click **+ Comment**) and type an instruction — e.g. *"make this less rambly"*, *"fix the grammar"*, *"convert to bullet points"*
3. Hit **Apply All with AI** — Quill sends the document and your instructions to the AI
4. Review the proposed changes (highlighted in green), accept or reject each one
5. Commit or discard

Comments are stored as HTML tokens inside the `.md` file so they persist across sessions without cluttering the document view.

**Supported providers:** Anthropic (Claude) and Google Gemini. Add your API key in the comment panel footer. Keys are saved to settings and routed through the native backend — never exposed in JS or URLs.

## Keyboard Shortcuts

| Action        | macOS       | Windows      |
| ------------- | ----------- | ------------ |
| New Tab       | Cmd+N       | Ctrl+N       |
| Open          | Cmd+O       | Ctrl+O       |
| Save          | Cmd+S       | Ctrl+S       |
| Save As       | Cmd+Shift+S | Ctrl+Shift+S |
| Close Tab     | Cmd+W       | Ctrl+W       |
| Find          | Cmd+F       | Ctrl+F       |
| Replace       | Cmd+H       | Ctrl+H       |
| Bold          | Cmd+B       | Ctrl+B       |
| Italic        | Cmd+I       | Ctrl+I       |
| Strikethrough | Cmd+Shift+X | Ctrl+Shift+X |
| Link          | Cmd+K       | Ctrl+K       |
| Add Comment   | Cmd+Shift+K | Ctrl+Shift+K |
| Code Block    | Cmd+Shift+C | Ctrl+Shift+C |
| Bullet List   | Cmd+Shift+8 | Ctrl+Shift+8 |
| Heading 1/2/3 | Cmd+1/2/3   | Ctrl+1/2/3   |
| Toggle Source | Cmd+/       | Ctrl+/       |
| Word Wrap     | Alt+Z       | Alt+Z        |
| Zoom In/Out   | Cmd++/-     | Ctrl++/-     |

## Installation

### macOS

1. Download `Quill.dmg` from [Releases](../../releases)
2. Open and drag to Applications
3. Right-click → Open (first launch only, app is not notarized)
4. `.md` files can be opened with Quill via "Open With"

### From Source

```bash
git clone https://github.com/mutantspoon/public-projects.git
cd public-projects/Quill

# Install JavaScript dependencies
cd ui && npm install && npm run build && cd ..

# Run in dev mode (macOS shortcut: double-click launch.command)
cd ui && npm run tauri:dev

# Production build
cargo tauri build
# Output: src-tauri/target/release/bundle/
```

## Tech Stack

* **Tauri 2** + **Rust** - Native window with embedded OS WebView (\~10MB binary)

* **Milkdown** - WYSIWYG Markdown editor built on ProseMirror

* **esbuild** - Fast JavaScript bundling

## Project Structure

```
Quill/
├── src-tauri/
│   ├── Cargo.toml           # Rust dependencies
│   ├── tauri.conf.json      # Window config, file associations
│   └── src/
│       └── main.rs          # Rust commands + app state
├── ui/
│   ├── index.html           # Main HTML shell
│   ├── css/                 # App styles and themes
│   ├── js/
│   │   ├── comments.js      # AI comment review system
│   │   └── ...              # Editor, tabs, toolbar, etc.
│   ├── test-ai.mjs          # AI prompt quality tests
│   ├── test-workflow.mjs    # Full pipeline integration tests
│   └── package.json         # Node dependencies
└── launch.command           # macOS double-click launcher (dev mode)
```

## License

MIT