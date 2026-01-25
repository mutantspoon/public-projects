// js/rendering.js - Object rendering
//
// Rendering behavior:
// - Walls: Rendered as draggable groups. Drag the line to move the whole wall.
//          Vertex handles (for endpoint editing) are managed by selection.js.
// - Rectangles: Rendered as draggable Rects. Select tool can drag them.
// - Text: Rendered as draggable Text. Select tool can drag them.
//
// All objects snap to grid on drag end.

import { WALL_THICKNESS, LABEL_FONT_SIZE } from './constants.js';
import { state, appState, getLayerById, DEFAULT_LAYER_ID, isObjectEditable } from './state.js';
import { contentLayer, stage } from './konva-setup.js';
import { distance, pixelsToInches, formatDimension } from './utils.js';
import { saveSnapshot } from './history.js';
import { snapPointToGrid } from './snapping.js';

// Screen-space size helper
function screenSize(pixels) {
  return pixels / stage.scaleX();
}

// Callbacks set by app.js
let callbacks = {
  onDelete: null,
  onSelect: null,
  onWallClick: null,
  onRectClick: null,
  onTextClick: null,
  onTextEdit: null,
  getCursorForTool: null,
  updateStatusBar: null
};

export function setRenderingCallbacks(cb) {
  Object.assign(callbacks, cb);
}

// Move text to top of layer
export function moveTextToTop() {
  state.objects.filter(obj => obj.type === 'text' || obj.type === 'label').forEach(obj => {
    const shape = contentLayer.findOne('#' + obj.id);
    if (shape) shape.moveToTop();
  });
  contentLayer.batchDraw();
}

// =============================================================================
// MAIN RENDER FUNCTION
// =============================================================================

export function renderAllObjects() {
  contentLayer.destroyChildren();

  // Filter visible objects and sort by layer order
  const visibleObjects = state.objects.filter(obj => {
    const layer = getLayerById(obj.layerId || DEFAULT_LAYER_ID);
    return layer && layer.visible;
  });

  // Sort by layer order
  visibleObjects.sort((a, b) => {
    const layerA = getLayerById(a.layerId || DEFAULT_LAYER_ID);
    const layerB = getLayerById(b.layerId || DEFAULT_LAYER_ID);
    return (layerA?.order || 0) - (layerB?.order || 0);
  });

  // Render non-text first, then text (text always on top)
  const textObjects = [];
  const otherObjects = [];
  for (const obj of visibleObjects) {
    if (obj.type === 'text' || obj.type === 'label') {
      textObjects.push(obj);
    } else {
      otherObjects.push(obj);
    }
  }

  otherObjects.forEach(obj => renderObject(obj));
  textObjects.forEach(obj => renderObject(obj));
  contentLayer.batchDraw();
}

// =============================================================================
// RENDER INDIVIDUAL OBJECTS
// =============================================================================

export function renderObject(obj) {
  const editable = isObjectEditable(obj);
  const isSelectTool = appState.currentTool === 'select';

  if (obj.type === 'wall') {
    renderWall(obj, editable, isSelectTool);
  } else if (obj.type === 'rectangle') {
    renderRectangle(obj, editable, isSelectTool);
  } else if (obj.type === 'text' || obj.type === 'label') {
    renderText(obj, editable, isSelectTool);
  }
}

// =============================================================================
// WALL RENDERING
// =============================================================================

function renderWall(obj, editable, isSelectTool) {
  const group = new Konva.Group({
    id: obj.id,
    name: 'wall-group',
    draggable: isSelectTool && editable
  });

  // The wall line
  const line = new Konva.Line({
    points: [obj.x1, obj.y1, obj.x2, obj.y2],
    stroke: '#2C3338',
    strokeWidth: screenSize(WALL_THICKNESS),
    lineCap: 'round',
    lineJoin: 'round',
    // Large hit area for easy clicking at any zoom
    hitStrokeWidth: Math.max(20, screenSize(30))
  });
  group.add(line);

  // Dimension label (if visible)
  if (appState.dimensionsVisible) {
    const len = distance(obj.x1, obj.y1, obj.x2, obj.y2);
    const inches = pixelsToInches(len);
    const midX = (obj.x1 + obj.x2) / 2;
    const midY = (obj.y1 + obj.y2) / 2;
    const angleRad = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
    const angle = angleRad * 180 / Math.PI;
    const normAngle = ((angle % 360) + 360) % 360;
    const textRot = (normAngle > 90 && normAngle < 270) ? angle + 180 : angle;
    const fontSize = screenSize(LABEL_FONT_SIZE);
    const labelText = formatDimension(inches);
    const textWidth = labelText.length * fontSize * 0.55;

    // Offset perpendicular to the wall (to the left of the line direction)
    const labelOffset = screenSize(18);
    const perpX = -Math.sin(angleRad) * labelOffset;
    const perpY = Math.cos(angleRad) * labelOffset;

    const dimLabel = new Konva.Text({
      x: midX + perpX,
      y: midY + perpY,
      text: labelText,
      fontSize: fontSize,
      fill: '#2C3338',
      fontStyle: 'bold',
      rotation: textRot,
      offsetX: textWidth / 2,
      listening: false
    });
    group.add(dimLabel);
  }

  // === DRAG HANDLING (move entire wall) ===
  let dragStartX1, dragStartY1, dragStartX2, dragStartY2;

  group.on('dragstart', () => {
    dragStartX1 = obj.x1;
    dragStartY1 = obj.y1;
    dragStartX2 = obj.x2;
    dragStartY2 = obj.y2;
  });

  group.on('dragend', () => {
    saveSnapshot();

    // Calculate how much the group moved
    const dx = group.x();
    const dy = group.y();

    // Snap the movement to grid
    const snappedMove = snapPointToGrid(dx, dy);

    // Update object positions
    obj.x1 = dragStartX1 + snappedMove.x;
    obj.y1 = dragStartY1 + snappedMove.y;
    obj.x2 = dragStartX2 + snappedMove.x;
    obj.y2 = dragStartY2 + snappedMove.y;

    // Reset group position and re-render
    group.position({ x: 0, y: 0 });
    renderAllObjects();

    // Re-select if this wall was selected
    if (appState.selectedId === obj.id && callbacks.onSelect) {
      callbacks.onSelect(obj.id);
    }
  });

  // === CLICK HANDLING ===
  group.on('click tap', e => {
    if (appState.currentTool === 'eraser' && editable) {
      e.cancelBubble = true;
      if (callbacks.onDelete) callbacks.onDelete(obj.id);
    } else if (appState.currentTool === 'select' && editable) {
      e.cancelBubble = true;
      if (callbacks.onSelect) callbacks.onSelect(obj.id);
    } else if (appState.currentTool === 'wall') {
      if (callbacks.onWallClick) callbacks.onWallClick();
    }
  });

  // === HOVER EFFECTS ===
  group.on('mouseenter', () => {
    if (appState.currentTool === 'eraser' && editable) {
      line.opacity(0.5);
      line.stroke('#A65E44');
      contentLayer.batchDraw();
      document.body.style.cursor = 'pointer';
    } else if (appState.currentTool === 'select' && editable) {
      line.opacity(0.8);
      contentLayer.batchDraw();
      document.body.style.cursor = 'move';
    } else if (appState.currentTool === 'wall') {
      line.stroke('#F3C044');
      line.strokeWidth(screenSize(WALL_THICKNESS + 2));
      contentLayer.batchDraw();
      document.body.style.cursor = 'crosshair';
    }
    appState.hoveredId = obj.id;
  });

  group.on('mouseleave', () => {
    line.opacity(1);
    line.stroke('#2C3338');
    line.strokeWidth(screenSize(WALL_THICKNESS));
    contentLayer.batchDraw();
    if (callbacks.getCursorForTool) {
      document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
    }
    appState.hoveredId = null;
  });

  contentLayer.add(group);
}

// =============================================================================
// RECTANGLE RENDERING
// =============================================================================

function renderRectangle(obj, editable, isSelectTool) {
  const rect = new Konva.Rect({
    id: obj.id,
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
    stroke: obj.stroke || '#2C3338',
    strokeWidth: screenSize(obj.strokeWidth || WALL_THICKNESS),
    fill: obj.fill || '',
    draggable: isSelectTool && editable
  });

  // Dimension labels
  let widthLabel = null, heightLabel = null;

  if (appState.dimensionsVisible) {
    const widthInches = pixelsToInches(obj.width);
    const heightInches = pixelsToInches(obj.height);
    const fontSize = screenSize(LABEL_FONT_SIZE);
    const widthText = formatDimension(widthInches);
    const heightText = formatDimension(heightInches);

    const widthTextWidth = widthText.length * fontSize * 0.55;
    const heightTextWidth = heightText.length * fontSize * 0.55;
    const textHeight = fontSize * 1.2;
    const labelOffset = screenSize(12);

    // Width label - below rectangle
    widthLabel = new Konva.Text({
      x: obj.x + obj.width / 2,
      y: obj.y + obj.height + labelOffset,
      text: widthText,
      fontSize: fontSize,
      fill: '#2C3338',
      fontStyle: 'bold',
      offsetX: widthTextWidth / 2,
      listening: false
    });

    // Height label - to the right of rectangle
    heightLabel = new Konva.Text({
      x: obj.x + obj.width + labelOffset + textHeight / 2,
      y: obj.y + obj.height / 2,
      text: heightText,
      fontSize: fontSize,
      fill: '#2C3338',
      fontStyle: 'bold',
      rotation: -90,
      offsetX: heightTextWidth / 2,
      listening: false
    });

    contentLayer.add(widthLabel, heightLabel);
  }

  // Track start position for snapping
  let startX, startY;

  rect.on('dragstart', () => {
    startX = rect.x();
    startY = rect.y();
  });

  rect.on('dragmove', () => {
    // Update dimension label positions during drag
    if (widthLabel && heightLabel) {
      const fontSize = screenSize(LABEL_FONT_SIZE);
      const labelOffset = screenSize(12);
      const textHeight = fontSize * 1.2;

      widthLabel.x(rect.x() + rect.width() / 2);
      widthLabel.y(rect.y() + rect.height() + labelOffset);
      heightLabel.x(rect.x() + rect.width() + labelOffset + textHeight / 2);
      heightLabel.y(rect.y() + rect.height() / 2);
    }
  });

  rect.on('dragend', () => {
    saveSnapshot();

    // Snap to grid
    const snapped = snapPointToGrid(rect.x(), rect.y());
    obj.x = snapped.x;
    obj.y = snapped.y;

    renderAllObjects();

    // Re-select if selected
    if (appState.selectedId === obj.id && callbacks.onSelect) {
      callbacks.onSelect(obj.id);
    }
  });

  // Click handling
  rect.on('click tap', e => {
    if (appState.currentTool === 'eraser' && editable) {
      e.cancelBubble = true;
      if (callbacks.onDelete) callbacks.onDelete(obj.id);
    } else if (appState.currentTool === 'select' && editable) {
      e.cancelBubble = true;
      if (callbacks.onSelect) callbacks.onSelect(obj.id);
    } else if (appState.currentTool === 'wall') {
      if (callbacks.onWallClick) callbacks.onWallClick();
    } else if (appState.currentTool === 'rectangle') {
      if (callbacks.onRectClick) callbacks.onRectClick();
    } else if (appState.currentTool === 'text') {
      if (callbacks.onTextClick) callbacks.onTextClick();
    }
  });

  // Hover effects
  rect.on('mouseenter', () => {
    if ((appState.currentTool === 'eraser' || appState.currentTool === 'select') && editable) {
      rect.opacity(appState.currentTool === 'eraser' ? 0.5 : 0.8);
      contentLayer.batchDraw();
      document.body.style.cursor = appState.currentTool === 'eraser' ? 'pointer' : 'move';
    }
    appState.hoveredId = obj.id;
  });

  rect.on('mouseleave', () => {
    rect.opacity(1);
    contentLayer.batchDraw();
    if (callbacks.getCursorForTool) {
      document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
    }
    appState.hoveredId = null;
  });

  contentLayer.add(rect);
}

// =============================================================================
// TEXT RENDERING
// =============================================================================

function renderText(obj, editable, isSelectTool) {
  const text = new Konva.Text({
    id: obj.id,
    x: obj.x,
    y: obj.y,
    text: obj.content,
    fontSize: obj.fontSize || 14,
    fill: obj.color || '#2C3338',
    fontStyle: obj.fontStyle || 'bold',
    draggable: isSelectTool && editable
  });

  let startX, startY;

  text.on('dragstart', () => {
    startX = text.x();
    startY = text.y();
  });

  text.on('dragend', () => {
    saveSnapshot();

    const snapped = snapPointToGrid(text.x(), text.y());
    obj.x = snapped.x;
    obj.y = snapped.y;

    renderAllObjects();

    if (appState.selectedId === obj.id && callbacks.onSelect) {
      callbacks.onSelect(obj.id);
    }
  });

  // Click handling
  text.on('click tap', e => {
    if (appState.currentTool === 'eraser' && editable) {
      e.cancelBubble = true;
      if (callbacks.onDelete) callbacks.onDelete(obj.id);
    } else if (appState.currentTool === 'select' && editable) {
      e.cancelBubble = true;
      if (callbacks.onSelect) callbacks.onSelect(obj.id);
    } else if (appState.currentTool === 'text' && editable) {
      e.cancelBubble = true;
      if (callbacks.onTextEdit) callbacks.onTextEdit(obj.id);
    } else if (appState.currentTool === 'wall') {
      if (callbacks.onWallClick) callbacks.onWallClick();
    } else if (appState.currentTool === 'rectangle') {
      if (callbacks.onRectClick) callbacks.onRectClick();
    }
  });

  // Double-click to edit
  text.on('dblclick dbltap', e => {
    if (appState.currentTool === 'select' && editable) {
      e.cancelBubble = true;
      if (callbacks.onTextEdit) callbacks.onTextEdit(obj.id);
    }
  });

  // Hover effects
  text.on('mouseenter', () => {
    if ((appState.currentTool === 'eraser' || appState.currentTool === 'select') && editable) {
      text.opacity(appState.currentTool === 'eraser' ? 0.5 : 0.8);
      contentLayer.batchDraw();
      document.body.style.cursor = appState.currentTool === 'eraser' ? 'pointer' : 'move';
    }
    appState.hoveredId = obj.id;
  });

  text.on('mouseleave', () => {
    text.opacity(1);
    contentLayer.batchDraw();
    if (callbacks.getCursorForTool) {
      document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
    }
    appState.hoveredId = null;
  });

  contentLayer.add(text);
}
