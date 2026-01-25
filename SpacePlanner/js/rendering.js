// js/rendering.js - Object rendering functions
// Renders shapes to contentLayer. Selection UI is handled by selection.js

import { WALL_THICKNESS, WALL_HIT_WIDTH, LABEL_FONT_SIZE } from './constants.js';
import { state, appState, getLayerById, DEFAULT_LAYER_ID, isObjectEditable } from './state.js';
import { contentLayer, stage } from './konva-setup.js';
import { distance, pixelsToInches, formatDimension } from './utils.js';
import { saveSnapshot } from './history.js';

// Helper to get screen-space size (constant visual size regardless of zoom)
function screenSize(pixels) {
  return pixels / stage.scaleX();
}

// Get viewport bounds in world coordinates
function getViewportBounds() {
  const scale = stage.scaleX();
  const pos = stage.position();
  return {
    left: -pos.x / scale,
    top: -pos.y / scale,
    right: (stage.width() - pos.x) / scale,
    bottom: (stage.height() - pos.y) / scale
  };
}

// Check if a point is within viewport (with margin)
function isPointVisible(x, y, margin = 0) {
  const vp = getViewportBounds();
  return x >= vp.left - margin && x <= vp.right + margin &&
         y >= vp.top - margin && y <= vp.bottom + margin;
}

// Clamp a point along a line segment to stay within viewport
function clampLabelPosition(x1, y1, x2, y2, midX, midY) {
  // If midpoint is visible, use it
  if (isPointVisible(midX, midY)) {
    return { x: midX, y: midY };
  }

  const vp = getViewportBounds();
  const margin = screenSize(50); // Margin from edge

  // Clamp midpoint to viewport bounds
  let clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, midX));
  let clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, midY));

  // Project clamped point onto the wall line to keep label aligned
  // Find the point on the line segment closest to the clamped position
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 > 0) {
    let t = ((clampedX - x1) * dx + (clampedY - y1) * dy) / len2;
    t = Math.max(0.1, Math.min(0.9, t)); // Keep away from endpoints
    clampedX = x1 + t * dx;
    clampedY = y1 + t * dy;

    // Final clamp to viewport
    clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, clampedX));
    clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, clampedY));
  }

  return { x: clampedX, y: clampedY };
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
  callbacks = { ...callbacks, ...cb };
}

export function moveTextToTop() {
  state.objects.filter(obj => obj.type === 'text' || obj.type === 'label').forEach(obj => {
    const shape = contentLayer.findOne('#' + obj.id);
    if (shape) shape.moveToTop();
  });
  contentLayer.batchDraw();
}

export function renderAllObjects() {
  contentLayer.destroyChildren();

  // Filter visible objects and sort by layer order
  const visibleObjects = state.objects.filter(obj => {
    const layer = getLayerById(obj.layerId || DEFAULT_LAYER_ID);
    return layer && layer.visible;
  });

  // Sort by layer order (ascending), then separate text to render on top
  visibleObjects.sort((a, b) => {
    const layerA = getLayerById(a.layerId || DEFAULT_LAYER_ID);
    const layerB = getLayerById(b.layerId || DEFAULT_LAYER_ID);
    return (layerA?.order || 0) - (layerB?.order || 0);
  });

  const textObjects = [], otherObjects = [];
  for (const obj of visibleObjects) {
    (obj.type === 'text' || obj.type === 'label' ? textObjects : otherObjects).push(obj);
  }
  otherObjects.forEach(obj => renderObject(obj));
  textObjects.forEach(obj => renderObject(obj));
  contentLayer.batchDraw();
}

export function renderObject(obj) {
  let shape;

  if (obj.type === 'wall') {
    const group = new Konva.Group({ id: obj.id, name: 'wall-group' });
    const line = new Konva.Line({
      points: [obj.x1, obj.y1, obj.x2, obj.y2],
      stroke: '#2C3338', strokeWidth: screenSize(WALL_THICKNESS), lineCap: 'round', lineJoin: 'round', hitStrokeWidth: screenSize(WALL_HIT_WIDTH)
    });

    const len = distance(obj.x1, obj.y1, obj.x2, obj.y2);
    const inches = pixelsToInches(len);
    const midX = (obj.x1 + obj.x2) / 2, midY = (obj.y1 + obj.y2) / 2;
    const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1) * 180 / Math.PI;
    const normAngle = ((angle % 360) + 360) % 360;
    const textRot = (normAngle > 90 && normAngle < 270) ? angle + 180 : angle;

    group.add(line);

    if (appState.dimensionsVisible) {
      const fontSize = screenSize(LABEL_FONT_SIZE);
      const labelText = formatDimension(inches);

      // Clamp label position to viewport if midpoint is off-screen
      const labelPos = clampLabelPosition(obj.x1, obj.y1, obj.x2, obj.y2, midX, midY);

      const dimLabel = new Konva.Text({
        x: labelPos.x, y: labelPos.y - screenSize(15), text: labelText,
        fontSize: fontSize, fill: '#5C6367', fontStyle: 'bold', rotation: textRot,
        offsetX: labelText.length * fontSize * 0.25, listening: false,
        name: 'wall-label-' + obj.id
      });
      group.add(dimLabel);
    }

    shape = group;

    group.on('click tap', e => {
      const editable = isObjectEditable(obj);
      if (appState.currentTool === 'eraser' && editable) { e.cancelBubble = true; if (callbacks.onDelete) callbacks.onDelete(obj.id); }
      else if (appState.currentTool === 'select' && editable) { e.cancelBubble = true; if (callbacks.onSelect) callbacks.onSelect(obj.id); }
      else if (appState.currentTool === 'wall') { if (callbacks.onWallClick) callbacks.onWallClick(); }
    });

    shape.on('mouseenter', () => {
      const editable = isObjectEditable(obj);
      if (appState.currentTool === 'eraser' && editable) { line.opacity(0.5); line.stroke('#A65E44'); contentLayer.batchDraw(); document.body.style.cursor = 'pointer'; }
      else if (appState.currentTool === 'select' && editable) { line.opacity(0.8); contentLayer.batchDraw(); document.body.style.cursor = 'pointer'; }
      else if (appState.currentTool === 'wall') { line.stroke('#F3C044'); line.strokeWidth(screenSize(WALL_THICKNESS + 2)); contentLayer.batchDraw(); document.body.style.cursor = 'crosshair'; }
      appState.hoveredId = obj.id;
    });

    shape.on('mouseleave', () => {
      line.opacity(1); line.stroke('#2C3338'); line.strokeWidth(screenSize(WALL_THICKNESS));
      contentLayer.batchDraw();
      if (callbacks.getCursorForTool) document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
      appState.hoveredId = null;
    });
  }
  else if (obj.type === 'rectangle') {
    const editable = isObjectEditable(obj);
    shape = new Konva.Rect({
      id: obj.id, x: obj.x, y: obj.y, width: obj.width, height: obj.height,
      stroke: obj.stroke || '#2C3338', strokeWidth: screenSize(obj.strokeWidth || WALL_THICKNESS),
      fill: obj.fill || '', draggable: appState.currentTool === 'select' && editable
    });

    // Dimension labels (conditional on dimensionsVisible)
    let widthLabel = null, heightLabel = null, heightText = null;

    if (appState.dimensionsVisible) {
      const widthInches = pixelsToInches(obj.width);
      const heightInches = pixelsToInches(obj.height);
      const fontSize = screenSize(LABEL_FONT_SIZE);
      const widthText = formatDimension(widthInches);
      heightText = formatDimension(heightInches);

      widthLabel = new Konva.Text({
        x: obj.x + obj.width / 2,
        y: obj.y + obj.height + screenSize(8),
        text: widthText,
        fontSize: fontSize, fill: '#5C6367', fontStyle: 'bold',
        offsetX: widthText.length * fontSize * 0.25,
        listening: false,
        name: 'rect-label-' + obj.id
      });

      heightLabel = new Konva.Text({
        x: obj.x + obj.width + screenSize(15),
        y: obj.y + obj.height / 2 + heightText.length * fontSize * 0.25,
        text: heightText,
        fontSize: fontSize, fill: '#5C6367', fontStyle: 'bold',
        rotation: -90,
        listening: false,
        name: 'rect-label-' + obj.id
      });

      contentLayer.add(widthLabel, heightLabel);
    }

    shape.on('dragmove', () => {
      if (widthLabel && heightLabel) {
        const fontSize = screenSize(LABEL_FONT_SIZE);
        widthLabel.x(shape.x() + shape.width() * shape.scaleX() / 2);
        widthLabel.y(shape.y() + shape.height() * shape.scaleY() + screenSize(8));
        heightLabel.x(shape.x() + shape.width() * shape.scaleX() + screenSize(15));
        heightLabel.y(shape.y() + shape.height() * shape.scaleY() / 2 + heightText.length * fontSize * 0.25);
      }
    });

    shape.on('dragend', () => {
      const current = state.objects.find(o => o.id === obj.id);
      if (current) {
        saveSnapshot();
        current.x = shape.x();
        current.y = shape.y();
        // Re-select to refresh handles at new position
        if (appState.selectedId === obj.id && callbacks.onSelect) {
          callbacks.onSelect(obj.id);
        }
      }
    });

    shape.on('mouseenter', () => {
      const editable = isObjectEditable(obj);
      if ((appState.currentTool === 'eraser' || appState.currentTool === 'select') && editable) {
        shape.opacity(appState.currentTool === 'eraser' ? 0.5 : 0.8);
        contentLayer.batchDraw(); document.body.style.cursor = 'pointer';
      }
      appState.hoveredId = obj.id;
    });

    shape.on('mouseleave', () => {
      shape.opacity(1); contentLayer.batchDraw();
      if (callbacks.getCursorForTool) document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
      appState.hoveredId = null;
    });

    shape.on('click tap', e => {
      const editable = isObjectEditable(obj);
      if (appState.currentTool === 'eraser' && editable) { e.cancelBubble = true; if (callbacks.onDelete) callbacks.onDelete(obj.id); }
      else if (appState.currentTool === 'select' && editable) { e.cancelBubble = true; if (callbacks.onSelect) callbacks.onSelect(obj.id); }
      else if (appState.currentTool === 'wall') { if (callbacks.onWallClick) callbacks.onWallClick(); }
      else if (appState.currentTool === 'rectangle') { if (callbacks.onRectClick) callbacks.onRectClick(); }
      else if (appState.currentTool === 'text') { if (callbacks.onTextClick) callbacks.onTextClick(); }
    });
  }
  else if (obj.type === 'text' || obj.type === 'label') {
    const editable = isObjectEditable(obj);
    shape = new Konva.Text({
      id: obj.id, x: obj.x, y: obj.y, text: obj.content,
      fontSize: obj.fontSize || 14, fill: obj.color || '#2C3338',
      fontStyle: obj.fontStyle || 'bold', draggable: appState.currentTool === 'select' && editable
    });

    shape.on('dragend', () => {
      const current = state.objects.find(o => o.id === obj.id);
      if (current) {
        saveSnapshot();
        current.x = shape.x();
        current.y = shape.y();
        // Re-select to refresh handles at new position
        if (appState.selectedId === obj.id && callbacks.onSelect) {
          callbacks.onSelect(obj.id);
        }
      }
    });

    shape.on('mouseenter', () => {
      const editable = isObjectEditable(obj);
      if ((appState.currentTool === 'eraser' || appState.currentTool === 'select') && editable) {
        shape.opacity(appState.currentTool === 'eraser' ? 0.5 : 0.8);
        contentLayer.batchDraw(); document.body.style.cursor = 'pointer';
      }
      appState.hoveredId = obj.id;
    });

    shape.on('mouseleave', () => {
      shape.opacity(1); contentLayer.batchDraw();
      if (callbacks.getCursorForTool) document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
      appState.hoveredId = null;
    });

    shape.on('click tap', e => {
      const editable = isObjectEditable(obj);
      if (appState.currentTool === 'eraser' && editable) { e.cancelBubble = true; if (callbacks.onDelete) callbacks.onDelete(obj.id); }
      else if (appState.currentTool === 'select' && editable) { e.cancelBubble = true; if (callbacks.onSelect) callbacks.onSelect(obj.id); }
      else if (appState.currentTool === 'text' && editable) { e.cancelBubble = true; if (callbacks.onTextEdit) callbacks.onTextEdit(obj.id); }
      else if (appState.currentTool === 'wall') { if (callbacks.onWallClick) callbacks.onWallClick(); }
      else if (appState.currentTool === 'rectangle') { if (callbacks.onRectClick) callbacks.onRectClick(); }
    });

    shape.on('dblclick dbltap', e => {
      const editable = isObjectEditable(obj);
      if (appState.currentTool === 'select' && editable) { e.cancelBubble = true; if (callbacks.onTextEdit) callbacks.onTextEdit(obj.id); }
    });
  }

  if (shape) contentLayer.add(shape);
}
