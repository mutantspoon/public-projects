# CLAUDE.md

## What This Is

**Quill** — a lightweight cross-platform WYSIWYG markdown editor: Tauri 2 (Rust backend in `src-tauri/src/main.rs`, native OS WebView) + Milkdown (ProseMirror) frontend, bundled with esbuild. Its standout feature is the AI comment review system (below). User-facing docs, keyboard shortcuts, and project layout live in `README.md`.

## Build / Run

```bash
cd ui && npm install         # first time only
cd ui && npm run tauri:dev   # dev: builds JS, then launches Tauri
cd ui && npm run tauri:build # production build → src-tauri/target/release/bundle/
cd ui && npm run watch       # JS watch mode (pair with `npx tauri dev` from Quill/)
```

- **Build output is `Quill/dist/`, NOT inside `ui/`.** `ui/build.mjs` bundles `ui/js/app.js` → `dist/js/bundle.js` and copies `index.html` + `css/` into `dist/`; `tauri.conf.json` points `frontendDist` at `../dist`. Editing `ui/js/*` does nothing until the bundle is rebuilt.
- The Tauri CLI runs via `npx tauri` (`@tauri-apps/cli` devDep at the Quill root) — no cargo-installed tauri-cli needed.
- Dev-test file associations by passing a path: `npx tauri dev -- myfile.md`.

## AI Comment Review System

Users select text, attach a comment instruction, then hit "Apply All with AI": the LLM gets the full document + instructions and returns `{find, replace}` operations (`find` must be verbatim document text), shown in a green-highlight review UI before committing. Comments persist as HTML tokens at the end of the .md file — `<!-- @quill-comment: <note> | anchor: <selected text> -->` — parsed and stripped on open, with the anchor used to re-find the position in ProseMirror. Implementation: `ui/js/comments.js`.

**API keys are stored in `settings.json` and routed through Rust (`call_anthropic` / `call_gemini` commands in `src-tauri/src/main.rs`) so keys are never exposed in JS or URLs.** Keep it that way. App models are set in `comments.js` (`claude-haiku-4-5-20251001` / `gemini-2.5-flash`).

### Known gotchas

- **Smart quotes**: Milkdown converts straight apostrophes/quotes to typographic ones (`'` → `'`). Anthropic normalizes them back to ASCII in `find` strings. `applyFindReplace()` has a quote-normalization fallback to handle this.
- **Anchor reanchoring**: Stored anchor text may have raw file whitespace that Milkdown normalizes. `reanchorComments()` normalizes the anchor (trim lines, drop blanks) before searching ProseMirror.
- **Comment tokens visible**: Tokens must be stripped from `tab.content` before calling `setContent()`. Milkdown renders HTML comments as visible text.
- **Full rewrites**: "Make less rambly" on a fragmented document (many tiny paragraphs) is hard for find/replace. Works best on well-formed single paragraphs.

## Test Harnesses

Two scripts in `ui/`, run directly with Node (no build step). Both hit real LLM APIs and read keys from `~/Library/Application Support/Quill/settings.json` — set them in the app first.

```bash
cd ui
node test-ai.mjs                     # prompt-quality tests; default gemini-2.5-flash
MODEL=haiku node test-ai.mjs         # aliases haiku/sonnet, or any raw model id
node test-workflow.mjs               # full-pipeline integration tests; Gemini only,
                                     # default gemini-3-flash-preview
```

To add a test case, copy an existing entry in the `TESTS` array of `test-ai.mjs`.

## Settings

`%APPDATA%\Quill\settings.json` (Windows) / `~/Library/Application Support/Quill/settings.json` (macOS): theme, font size, word wrap, window geometry, recent files, API keys.
