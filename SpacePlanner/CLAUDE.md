# SpacePlanner

Browser-based 2D vector drawing tool for interior design and room layouts (Konva.js). Deployed to GitHub Pages; also runs from `file://` with just `index.html` + `bundle.js`.

## Project Structure

```
SpacePlanner/
  index.html          # Main HTML file (references bundle.js)
  bundle.js           # Built output - DO NOT EDIT directly
  build.bat           # Windows-only manual rebuild (rarely needed here)
  LAYOUT_FORMAT.md    # .layout file format spec (read/write layouts without the GUI)
  render_layout.py    # Headless .layout → PNG renderer
  js/                 # Source modules - EDIT THESE
    app.js            # Main entry point, event wiring
    constants.js      # SCALE, GRID_*, WALL_*, COLOR_PALETTE
    utils.js          # UUID, distance, dimension parsing
    state.js          # state, appState, history objects
    konva-setup.js    # Stage and layer initialization
    grid.js           # LOD grid rendering, zoom/pan
    snapping.js       # Grid snap, vertex snap, smart guides
    history.js        # Undo/redo system
    rendering.js      # Object rendering with callbacks
    selection.js      # Unified SelectionManager (highlights, handles, editing)
    file-io.js        # Save, load, export PNG
    ui-helpers.js     # Cursors, panels, color palettes
    keyboard.js       # Keyboard shortcuts
    tools/            # wall-tool.js, rectangle-tool.js, text-tool.js (creation only)
    layer-panel.js    # Layer management panel
```

## Build Process

A PostToolUse hook (`../.claude/hooks/spaceplanner-rebuild.sh`) rebuilds
`bundle.js` automatically after any edit under `js/` and surfaces esbuild
errors if the bundle breaks. Manual rebuild if ever needed:

```bash
cd SpacePlanner
npx esbuild js/app.js --bundle --outfile=bundle.js --format=iife
```

First-time setup (if you don't have esbuild):
```bash
npm install -g esbuild
# Or use npx (no install needed, slightly slower)
```

The HTML references `bundle.js`, not the ES6 modules directly (browser CORS restrictions prevent loading modules from file:// protocol).

## Headless Rendering & the .layout Format

- **`LAYOUT_FORMAT.md`** documents the `.layout` JSON format (1 inch = 5 px, layers, object schemas) so layouts can be read or generated without the GUI.
- **`render_layout.py`** renders a `.layout` file to PNG for visual verification (requires Pillow):
  ```bash
  python3 render_layout.py <file.layout> [output.png]   # default output: <file>.png
  ```
  Its docstring also advertises `--show-layers`, but that flag is not implemented — any second argument is treated as the output path.

## Architecture Notes

- **Callback pattern**: Modules use `setXxxCallbacks()` functions to avoid circular dependencies; app.js wires them during init
- **Tool state**: Each tool module manages its own drawing state (e.g., `wallStart` in wall-tool.js)
- **Unified selection**: selection.js owns ALL selection UI (highlights, handles, previews)
- **Tool modules**: Only handle object CREATION, not editing - selection.js handles editing

### Selection Architecture (Unified SelectionManager)

All selection UI is consolidated in `selection.js`: highlights (dashed outline), handles (draggable circles), and previews (ghost shapes during resize). This avoids the anti-pattern of multiple overlapping systems (Transformer, custom handles, separate highlights) that previously caused handles left behind after delete, preview lines not updating, and inconsistent cleanup on deselect.

**Key principle**: `deselectObject()` cleans up ALL UI unconditionally without checking object type.

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `tools/*.js` | Object CREATION only (ghost preview while drawing) |
| `selection.js` | Object EDITING (handles, resize, move) |
| `rendering.js` | Object DISPLAY (draw shapes, attach click handlers) |
| `app.js` | Event wiring and tool switching |

## Distribution

To share outside GitHub Pages: `index.html` and `bundle.js` (two files only).
