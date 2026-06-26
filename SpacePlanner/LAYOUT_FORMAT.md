# SpacePlanner .layout File Format

This document explains the `.layout` file format so Claude can read existing files and generate new ones without the GUI.

---

## Units & Scale

- All coordinates and dimensions are stored in **pixels** (internal canvas units)
- `SCALE = 5` → **1 inch = 5 pixels**, **1 foot = 60 pixels**
- To convert: `inches × 5 = pixels`, `pixels ÷ 5 = inches`

**Examples:**
- 10 feet = 120 inches = 600 pixels
- 8 feet 6 inches = 102 inches = 510 pixels
- A 12×10 ft room → width: 720px, height: 600px

---

## Top-Level Structure

```json
{
  "version": "1.1",
  "scale": 5,
  "unit": "inches",
  "created": "2026-03-22T00:00:00.000Z",
  "layers": [...],
  "activeLayerId": "layer-1",
  "view": {
    "x": 0,
    "y": 0,
    "zoom": 1
  },
  "objects": [...]
}
```

| Field | Description |
|-------|-------------|
| `version` | Always `"1.1"` |
| `scale` | Always `5` (pixels per inch) |
| `unit` | Always `"inches"` |
| `created` | ISO 8601 timestamp |
| `layers` | Array of layer definitions |
| `activeLayerId` | ID of the currently active layer |
| `view` | Camera position and zoom (can be `{"x":0,"y":0,"zoom":1}`) |
| `objects` | Array of all drawn objects |

---

## Layers

Every layout has at least one layer. Objects reference layers by ID.

```json
{
  "id": "layer-1",
  "name": "Layer 1",
  "visible": true,
  "locked": false,
  "order": 0
}
```

| Field | Description |
|-------|-------------|
| `id` | Unique string ID (use `"layer-1"` for single-layer layouts) |
| `name` | Display name |
| `visible` | Whether objects on this layer are shown |
| `locked` | Whether objects on this layer can be edited |
| `order` | Render order (higher = on top) |

---

## Objects

All objects share these common fields:

| Field | Description |
|-------|-------------|
| `type` | `"wall"`, `"rectangle"`, or `"label"` |
| `id` | UUID string (format: `"xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"`) |
| `layerId` | ID of the layer this object belongs to |

---

### Wall

A line segment representing a wall. Displayed with thickness.

```json
{
  "type": "wall",
  "id": "a1b2c3d4-...",
  "layerId": "layer-1",
  "x1": 100,
  "y1": 100,
  "x2": 700,
  "y2": 100
}
```

| Field | Description |
|-------|-------------|
| `x1`, `y1` | Start point in pixels |
| `x2`, `y2` | End point in pixels |

**Notes:**
- Wall thickness is rendered at 6px (visual constant, not stored)
- For a 10-foot wall: end point = start + 600px on one axis

---

### Rectangle

A filled or stroked rectangle. Used for rooms, furniture, or annotations.

```json
{
  "type": "rectangle",
  "id": "a1b2c3d4-...",
  "layerId": "layer-1",
  "x": 100,
  "y": 100,
  "width": 600,
  "height": 480,
  "stroke": "#2C3338",
  "strokeWidth": 6,
  "fill": "#2C3338"
}
```

| Field | Description |
|-------|-------------|
| `x`, `y` | Top-left corner in pixels |
| `width`, `height` | Dimensions in pixels |
| `stroke` | Hex color for the border |
| `strokeWidth` | Always `6` |
| `fill` | Hex color for fill, or `""` for no fill (outline only) |

**Color palette** (all valid colors):
```
#F2F1EF  #DED6C7  #B1A796  #848C8E
#5C6367  #3A3F42  #7A8B7C  #528A81
#2D453E  #F3C044  #C88132  #A65E44
#634B35  #4A5D66  #2C3338  #1D2226
```

---

### Label (Text)

A text label placed on the canvas.

```json
{
  "type": "label",
  "id": "a1b2c3d4-...",
  "layerId": "layer-1",
  "x": 350,
  "y": 300,
  "content": "Living Room",
  "fontSize": 14,
  "color": "#2C3338",
  "fontStyle": "bold"
}
```

| Field | Description |
|-------|-------------|
| `x`, `y` | Position of the label anchor in pixels |
| `content` | The text string to display |
| `fontSize` | Always `14` |
| `color` | Text color hex (default `"#2C3338"`) |
| `fontStyle` | Always `"bold"` |

---

## Coordinate System

- Origin `(0, 0)` is at the top-left of the canvas
- X increases to the right
- Y increases downward
- The canvas is effectively infinite; the `view` object just sets the initial camera

**Practical starting point:** Place objects starting around `(100, 100)` to leave margin.

---

## Complete Example: Simple Room

A 12×10 ft room with a label:

```json
{
  "version": "1.1",
  "scale": 5,
  "unit": "inches",
  "created": "2026-03-22T00:00:00.000Z",
  "layers": [
    { "id": "layer-1", "name": "Layer 1", "visible": true, "locked": false, "order": 0 }
  ],
  "activeLayerId": "layer-1",
  "view": { "x": 0, "y": 0, "zoom": 1 },
  "objects": [
    {
      "type": "wall", "id": "wall-top",
      "layerId": "layer-1",
      "x1": 100, "y1": 100, "x2": 820, "y2": 100
    },
    {
      "type": "wall", "id": "wall-right",
      "layerId": "layer-1",
      "x1": 820, "y1": 100, "x2": 820, "y2": 700
    },
    {
      "type": "wall", "id": "wall-bottom",
      "layerId": "layer-1",
      "x1": 820, "y1": 700, "x2": 100, "y2": 700
    },
    {
      "type": "wall", "id": "wall-left",
      "layerId": "layer-1",
      "x1": 100, "y1": 700, "x2": 100, "y2": 100
    },
    {
      "type": "label", "id": "label-room",
      "layerId": "layer-1",
      "x": 460, "y": 400,
      "content": "Living Room (12' × 10')",
      "fontSize": 14, "color": "#2C3338", "fontStyle": "bold"
    }
  ]
}
```

**Math check:** 12 ft = 720px, 10 ft = 600px → walls span from (100,100) to (820,700). ✓

---

## Tips for Generating Layouts

1. **Use simple IDs** — any unique string works (e.g. `"wall-north"`, `"room-kitchen"`). UUIDs are not required.
2. **Align to 5px increments** — this keeps coordinates on the inch grid, which snaps cleanly in the app.
3. **Align to 60px increments** — for foot-level precision (cleaner dimension labels in the app).
4. **Walls don't auto-connect** — each wall segment is independent. To form a room, create 4 walls whose endpoints share the same coordinates.
5. **Rectangles are simpler than walls** for closed rooms — one rectangle object vs. four wall objects.
6. **No fill = outline only** — set `"fill": ""` for transparent rectangles (e.g. to represent a table outline).
