# Layer System Plan

## Overview

Add a layer management system to SpacePlanner, allowing users to organize objects (walls, rectangles, text) into separate layers that can be independently selected, locked, and hidden.

## Use Cases

- **Walls layer**: Draw room boundaries, lock when done
- **Furniture layer**: Add furniture rectangles without accidentally moving walls
- **Annotations layer**: Text labels that can be hidden for clean exports
- **Multiple rooms**: Separate layers for different areas

## Data Model

### Layer Object
```javascript
{
  id: string,          // UUID
  name: string,        // User-editable name ("Walls", "Furniture", etc.)
  visible: boolean,    // Show/hide layer contents
  locked: boolean,     // Prevent selection/editing of objects on this layer
  order: number        // Render order (higher = on top)
}
```

### State Changes

**state.js** - Add to `state`:
```javascript
layers: [
  { id: 'default', name: 'Layer 1', visible: true, locked: false, order: 0 }
]
```

**state.js** - Add to `appState`:
```javascript
activeLayerId: 'default'
```

**Objects** - Each object gets a `layerId` property:
```javascript
{
  type: 'rectangle',
  id: '...',
  layerId: 'default',  // NEW
  // ... other properties
}
```

## UI Design

### Layer Panel (Bottom-Left)
```
+---------------------------+
| LAYERS              [+]   |  <- Add layer button
+---------------------------+
| [v] [L] Layer 1    [...]  |  <- Active (highlighted)
| [v] [ ] Furniture  [...]  |
| [ ] [ ] Hidden     [...]  |  <- Eye unchecked = hidden
+---------------------------+
| [Move to Layer]           |  <- Moves selected objects
+---------------------------+

[v] = Visibility toggle (eye icon or checkbox)
[L] = Lock toggle (shows lock icon when locked)
[...] = Context menu (rename, delete, move up/down)
```

### Panel Styling
- Same cream/slate color scheme as other panels
- Width: ~160px
- Position: fixed, bottom-left (above status bar)
- Active layer has sage-400 highlight background

### Layer Row States
- **Active**: Background highlight (sage-400/light)
- **Locked**: Lock icon visible, slightly dimmed
- **Hidden**: Eye icon crossed out, row text dimmed

## Behavior

### Drawing New Objects
- New objects automatically get `layerId: appState.activeLayerId`
- Cannot draw on locked layer (show warning in status bar)
- Cannot draw on hidden layer (show warning in status bar)

### Selection
- Cannot select objects on locked layers
- Cannot select objects on hidden layers
- When clicking, only check objects on unlocked/visible layers

### Moving Objects to Layer
- Select objects first
- Click "Move to Layer" button (moves to active layer)
- Or right-click context menu on layer row

### Layer Operations
- **Add Layer**: Creates new layer, makes it active
- **Delete Layer**: Moves objects to default layer first, then deletes
- **Rename Layer**: Inline edit or prompt
- **Reorder Layers**: Drag or up/down buttons in context menu
- **Toggle Visibility**: Click eye icon
- **Toggle Lock**: Click lock icon

### Rendering Order
1. Render layers in `order` sequence (low to high)
2. Within each layer, render objects in array order
3. Hidden layers skip rendering entirely

## Implementation Steps

### Phase 1: Data Model
1. Add `layers` array to `state` with default layer
2. Add `activeLayerId` to `appState`
3. Add `layerId` property to all object creation (wall-tool, rectangle-tool, text-tool)
4. Handle missing `layerId` on old objects (default to first layer)

### Phase 2: Layer Panel UI
1. Create layer-panel HTML structure in index.html
2. Style with Tailwind (match existing panel aesthetic)
3. Create js/layer-panel.js module:
   - `renderLayerPanel()` - Rebuild panel contents
   - `selectLayer(id)` - Set active layer
   - `toggleLayerVisibility(id)`
   - `toggleLayerLock(id)`
   - `addLayer()`
   - `deleteLayer(id)`
   - `renameLayer(id, name)`

### Phase 3: Selection Integration
1. Update selection.js to skip locked/hidden layers
2. Update rendering.js to check layer visibility
3. Update mouse event handlers to respect layer states

### Phase 4: Drawing Integration
1. Update wall-tool.js to assign activeLayerId
2. Update rectangle-tool.js to assign activeLayerId
3. Update text-tool.js to assign activeLayerId
4. Add checks for locked/hidden active layer

### Phase 5: Move to Layer
1. Add "Move to Layer" button to layer panel
2. Implement moveSelectedToActiveLayer() function
3. Update object layerId and re-render

### Phase 6: Persistence
1. Include layers in save/load JSON
2. Maintain backward compatibility (add default layer if missing)

## File Changes Summary

| File | Changes |
|------|---------|
| index.html | Add layer panel HTML |
| js/state.js | Add layers array, activeLayerId |
| js/layer-panel.js | NEW - Layer panel logic |
| js/app.js | Import layer-panel, wire up events |
| js/rendering.js | Filter by layer visibility, order by layer |
| js/selection.js | Skip locked/hidden layers |
| js/tools/wall-tool.js | Add layerId to new walls |
| js/tools/rectangle-tool.js | Add layerId to new rectangles |
| js/tools/text-tool.js | Add layerId to new text |
| js/file-io.js | Save/load layers |

## Decisions Made

1. **Default layers**: Single "Layer 1" - let users create what they need
2. **Multi-select across layers**: Allowed (if layers are unlocked)
3. **Layer reordering**: Up/down buttons in context menu (not drag-and-drop for v1)
4. **Context menu**: Rename, Delete, Move Up, Move Down

## Notes

- Keep it simple for v1 - basic visibility, locking, and organization
- The layer panel should feel lightweight, not like a heavy Photoshop layers panel
- Status bar feedback is important when actions are blocked by locked/hidden layers
