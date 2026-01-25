# SpacePlanner

Browser-based 2D vector drawing tool for interior design and room layouts.

## Project Structure

```
SpacePlanner/
  index.html          # Main HTML file (references bundle.js)
  bundle.js           # Built output - DO NOT EDIT directly
  build.bat           # Run this after editing js/ files
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
    tools/
      wall-tool.js      # Wall creation only (editing in selection.js)
      rectangle-tool.js # Rectangle creation only (editing in selection.js)
      text-tool.js      # Text/label creation
    layer-panel.js    # Layer management panel
```

## Build Process

**IMPORTANT:** After editing ANY file in `js/`, you MUST rebuild:

```bash
cd D:/Projects/tools/SpacePlanner
build.bat
```

Or manually:
```bash
npx esbuild js/app.js --bundle --outfile=bundle.js --format=iife
```

The HTML references `bundle.js`, not the ES6 modules directly (browser CORS restrictions prevent loading modules from file:// protocol).

## Architecture Notes

- **Callback pattern**: Modules use `setXxxCallbacks()` functions to avoid circular dependencies
- **Tool state**: Each tool module manages its own drawing state (e.g., `wallStart` in wall-tool.js)
- **Unified selection**: selection.js owns ALL selection UI (highlights, handles, previews)
- **Tool modules**: Only handle object CREATION, not editing - selection.js handles editing

### Selection Architecture (Unified SelectionManager)

All selection UI is consolidated in `selection.js`:
- **Highlights**: Dashed outline showing what's selected
- **Handles**: Draggable circles for resizing/moving endpoints
- **Previews**: Ghost shapes during resize operations

This avoids the anti-pattern of having multiple overlapping systems (Transformer, custom handles, separate highlights) that led to bugs like:
- Handles left behind after delete
- Preview lines not updating
- Inconsistent cleanup on deselect

**Key principle**: `deselectObject()` cleans up ALL UI unconditionally without checking object type.

### Module Responsibilities

| Module | Responsibility |
|--------|----------------|
| `tools/*.js` | Object CREATION only (ghost preview while drawing) |
| `selection.js` | Object EDITING (handles, resize, move) |
| `rendering.js` | Object DISPLAY (draw shapes, attach click handlers) |
| `app.js` | Event wiring and tool switching |

## Key Features

- Wall drawing with dimension labels
- Rectangle tool with stroke/fill colors
- Text labels
- **Layer system** (visibility, locking, organization)
- Snap to grid (1" default, Ctrl/Cmd for 1' grid)
- Snap to vertices and wall midpoints
- Smart guides (align to object edges)
- Shift key for axis lock
- Box selection
- Undo/redo (Ctrl+Z / Ctrl+Y)
- Save/load .layout files
- Export PNG

## Layer System

The layer panel (bottom-left) allows organizing objects into layers:

- **Visibility toggle** (eye icon) - Show/hide all objects on a layer
- **Lock toggle** (lock icon) - Prevent selection/editing of objects on locked layers
- **Active layer** (highlighted) - New objects are created on the active layer
- **Move to Layer** button - Moves selected objects to the active layer
- **Context menu** (...) - Rename, Delete, Move Up/Down

### Layer Behavior
- Cannot select/edit objects on locked or hidden layers
- Cannot draw on locked or hidden layers (shows warning)
- Layers render in order (higher order = on top)
- Delete layer moves its objects to another layer first
- Old layout files without layers get a default "Layer 1"

## Distribution

To share: include `index.html` and `bundle.js` (two files only).

## Architectural Lessons Learned

These patterns emerged from refactoring this project and should inform future similar projects:

### 1. Single Owner for UI State

**Problem**: Having multiple systems manage overlapping UI (e.g., Konva Transformer + custom handles + highlight shapes) creates cleanup bugs and inconsistent behavior.

**Solution**: One module should own ALL related UI. For selection, that means selection.js owns highlights, handles, AND previews for all object types.

### 2. Unconditional Cleanup

**Problem**: Cleanup functions that check object type before deciding what to clean up fail when the object was already deleted.

**Solution**: `deselectObject()` should clean up EVERYTHING unconditionally - clear all highlights, all handles, all previews. The extra work of destroying nonexistent shapes is trivial.

### 3. Creation vs Editing Separation

**Problem**: Tool modules that handle both creation AND editing become complex with interleaved state.

**Solution**: Tool modules handle CREATION only (ghost shapes while drawing). Selection module handles EDITING (drag handles, resize).

### 4. Callback Pattern for Circular Dependencies

**Problem**: ES6 modules can't have circular imports. rendering.js needs to call selection functions, selection.js needs to call render functions.

**Solution**: Use `setXxxCallbacks()` pattern - each module exposes a callback setter, and app.js wires them together during init.

### 5. State Lookups by ID

**Problem**: Holding object references that become stale after operations.

**Solution**: Always look up objects fresh by ID from `state.objects` when needed. Store only the ID.

## User Development Preferences

For future interactive editor projects:

1. **Fix issues incrementally** - Don't rewrite working code unless there's a structural problem
2. **Test after each change** - Rebuild and verify functionality works before moving on
3. **Prefer simple solutions** - Custom handles over complex library features when the use case is simple
4. **Clean up dead code** - Remove unused exports, callbacks, and imports after refactoring
5. **Document architectural decisions** - Update CLAUDE.md when patterns change
