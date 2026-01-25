// js/selection.js - Unified Selection Manager
// This module owns ALL selection UI: highlights, handles, and previews
// No more callbacks to tool modules for handle creation

import { WALL_THICKNESS, HANDLE_RADIUS, HANDLE_STROKE, HIGHLIGHT_STROKE, LABEL_FONT_SIZE } from './constants.js';
import { appState, state, isObjectEditable, DEFAULT_LAYER_ID } from './state.js';
import { contentLayer, uiLayer, stage } from './konva-setup.js';
import { saveSnapshot } from './history.js';
import { updateStatusBar, distance, pixelsToInches, formatDimension, generateUUID } from './utils.js';
import { getSnappedPoint } from './snapping.js';

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

// Check if a point is within viewport
function isPointVisible(x, y) {
  const vp = getViewportBounds();
  return x >= vp.left && x <= vp.right && y >= vp.top && y <= vp.bottom;
}

// Clamp label position along wall line to stay within viewport
function clampLabelPosition(x1, y1, x2, y2, midX, midY) {
  if (isPointVisible(midX, midY)) {
    return { x: midX, y: midY };
  }

  const vp = getViewportBounds();
  const margin = screenSize(50);

  let clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, midX));
  let clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, midY));

  // Project onto wall line
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 > 0) {
    let t = ((clampedX - x1) * dx + (clampedY - y1) * dy) / len2;
    t = Math.max(0.1, Math.min(0.9, t));
    clampedX = x1 + t * dx;
    clampedY = y1 + t * dy;
    clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, clampedX));
    clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, clampedY));
  }

  return { x: clampedX, y: clampedY };
}

// Callbacks
let renderAllObjects = null;
let showRectanglePanel = null;
let updateRectanglePanelFromSelection = null;
let updateMoveToLayerButton = null;

export function setSelectionCallbacks(cb) {
  if (cb.renderAllObjects) renderAllObjects = cb.renderAllObjects;
  if (cb.showRectanglePanel) showRectanglePanel = cb.showRectanglePanel;
  if (cb.updateRectanglePanelFromSelection) updateRectanglePanelFromSelection = cb.updateRectanglePanelFromSelection;
  if (cb.updateMoveToLayerButton) updateMoveToLayerButton = cb.updateMoveToLayerButton;
}

// ===== MAIN SELECTION API =====

export function selectObject(id) {
  const obj = state.objects.find(o => o.id === id);
  if (!obj) return;

  // Check if object is on an editable layer
  if (!isObjectEditable(obj)) {
    updateStatusBar('Cannot select: layer is locked or hidden');
    return;
  }

  if (appState.selectedId && appState.selectedId !== id) {
    deselectObject();
  }

  appState.selectedId = id;

  // Create appropriate UI based on type
  drawSelectionHighlight(obj);
  createHandles(obj);

  // Show rectangle panel if applicable
  if (obj.type === 'rectangle') {
    if (showRectanglePanel) showRectanglePanel(true);
    if (updateRectanglePanelFromSelection) updateRectanglePanelFromSelection(obj);
  }

  if (updateMoveToLayerButton) updateMoveToLayerButton();
  updateStatusBar(`Selected: ${obj.type}`);
}

export function deselectObject() {
  // Clean up ALL selection UI unconditionally
  clearAllHighlights();
  clearAllHandles();
  clearAllPreviews();
  clearMultiSelectGroup();
  if (showRectanglePanel) showRectanglePanel(false);

  appState.selectedId = null;
  appState.selectedIds = [];
  if (updateMoveToLayerButton) updateMoveToLayerButton();
  uiLayer.batchDraw();
  contentLayer.batchDraw();
}

// Multi-selection: highlights only, no handles, allows group dragging
export function selectObjects(ids) {
  if (ids.length === 0) return;

  // If only one object, use single selection (with handles)
  if (ids.length === 1) {
    selectObject(ids[0]);
    return;
  }

  // Clear previous selection
  deselectObject();

  // Filter to only editable objects
  const editableIds = ids.filter(id => {
    const obj = state.objects.find(o => o.id === id);
    return obj && isObjectEditable(obj);
  });

  if (editableIds.length === 0) return;
  if (editableIds.length === 1) {
    selectObject(editableIds[0]);
    return;
  }

  // Store multi-selection
  appState.selectedIds = editableIds;
  appState.selectedId = null; // Clear single selection

  // Draw highlights for all selected objects
  const objects = editableIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
  drawMultiSelectionHighlights(objects);

  // Create drag group for multi-selection
  createMultiSelectDragGroup(objects);

  if (updateMoveToLayerButton) updateMoveToLayerButton();
  updateStatusBar(`Selected ${editableIds.length} objects (drag to move)`);
}

// ===== HIGHLIGHTS =====

let highlights = [];

function createHighlightForObject(obj) {
  const ss = screenSize;
  const pad = ss(4);
  const stroke = ss(HIGHLIGHT_STROKE);
  const dash = [ss(6), ss(4)];
  let highlight = null;

  // Unified selection style: dashed outline for all object types
  if (obj.type === 'wall') {
    // Create a rect around the wall's bounding box
    const minX = Math.min(obj.x1, obj.x2);
    const minY = Math.min(obj.y1, obj.y2);
    const maxX = Math.max(obj.x1, obj.x2);
    const maxY = Math.max(obj.y1, obj.y2);
    highlight = new Konva.Rect({
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2,
      stroke: '#528A81',
      strokeWidth: stroke,
      dash: dash,
      opacity: 0.9,
      listening: false,
      name: 'highlight-' + obj.id
    });
  } else if (obj.type === 'rectangle') {
    highlight = new Konva.Rect({
      x: obj.x - pad,
      y: obj.y - pad,
      width: obj.width + pad * 2,
      height: obj.height + pad * 2,
      stroke: '#528A81',
      strokeWidth: stroke,
      dash: dash,
      opacity: 0.9,
      listening: false,
      name: 'highlight-' + obj.id
    });
  } else if (obj.type === 'text' || obj.type === 'label') {
    const shape = contentLayer.findOne('#' + obj.id);
    const width = shape ? shape.width() : 50;
    const height = shape ? shape.height() : 20;
    highlight = new Konva.Rect({
      x: obj.x - pad,
      y: obj.y - pad,
      width: width + pad * 2,
      height: height + pad * 2,
      stroke: '#528A81',
      strokeWidth: stroke,
      dash: dash,
      opacity: 0.9,
      listening: false,
      name: 'highlight-' + obj.id
    });
  }

  return highlight;
}

function drawSelectionHighlight(obj) {
  clearAllHighlights();
  const highlight = createHighlightForObject(obj);
  if (highlight) {
    highlights.push(highlight);
    uiLayer.add(highlight);
    uiLayer.batchDraw();
  }
}

function drawMultiSelectionHighlights(objects) {
  clearAllHighlights();
  for (const obj of objects) {
    const highlight = createHighlightForObject(obj);
    if (highlight) {
      highlights.push(highlight);
      uiLayer.add(highlight);
    }
  }
  uiLayer.batchDraw();
}

function updateSelectionHighlight() {
  if (appState.selectedIds.length > 0) {
    const objects = appState.selectedIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
    if (objects.length > 1) {
      drawMultiSelectionHighlights(objects);
    } else if (objects.length === 1) {
      drawSelectionHighlight(objects[0]);
    }
  } else if (appState.selectedId) {
    const obj = state.objects.find(o => o.id === appState.selectedId);
    if (obj) drawSelectionHighlight(obj);
  }
}

function clearAllHighlights() {
  highlights.forEach(h => h.destroy());
  highlights = [];
}

// For external use (e.g., after drag)
export function updateWallSelectionHighlight() { updateSelectionHighlight(); }
export function updateRectangleSelectionHighlight() { updateSelectionHighlight(); }

// Refresh selection UI after zoom (recreates handles/highlights at new scale)
export function refreshSelectionUI() {
  // Handle multi-selection
  if (appState.selectedIds.length > 0) {
    const objects = appState.selectedIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
    if (objects.length > 1) {
      drawMultiSelectionHighlights(objects);
      createMultiSelectDragGroup(objects);
    } else if (objects.length === 1) {
      drawSelectionHighlight(objects[0]);
      createHandles(objects[0]);
    }
    return;
  }

  // Handle single selection
  if (!appState.selectedId) return;
  const obj = state.objects.find(o => o.id === appState.selectedId);
  if (obj) {
    drawSelectionHighlight(obj);
    createHandles(obj);
  }
}

// ===== HANDLES =====

let handles = [];
let currentObjectId = null;

function createHandles(obj) {
  clearAllHandles();
  currentObjectId = obj.id;

  if (obj.type === 'wall') {
    createWallHandles(obj);
  } else if (obj.type === 'rectangle') {
    createRectangleHandles(obj);
  }
  // Text/labels: no handles needed - already draggable via the shape itself

  uiLayer.batchDraw();
}

function clearAllHandles() {
  handles.forEach(h => h.destroy());
  handles = [];
  currentObjectId = null;
}

// --- Wall Handles (2 endpoints) ---

function createWallHandles(wallObj) {
  [1, 2].forEach(i => {
    const handle = new Konva.Circle({
      x: i === 1 ? wallObj.x1 : wallObj.x2,
      y: i === 1 ? wallObj.y1 : wallObj.y2,
      radius: screenSize(HANDLE_RADIUS + 2),
      fill: '#528A81',
      stroke: '#2D453E',
      strokeWidth: screenSize(HANDLE_STROKE),
      draggable: true,
      name: 'handle'
    });

    handle.on('dragmove', () => {
      clearAllHighlights(); // Hide highlight during drag
      const snapped = getSnappedPoint(handle.x(), handle.y());
      handle.position(snapped);
      const current = state.objects.find(o => o.id === currentObjectId);
      if (current) updateWallPreview(current, i, snapped);
    });

    handle.on('dragend', () => {
      const current = state.objects.find(o => o.id === currentObjectId);
      if (!current) return;

      saveSnapshot();
      if (i === 1) {
        current.x1 = handle.x();
        current.y1 = handle.y();
      } else {
        current.x2 = handle.x();
        current.y2 = handle.y();
      }

      clearAllPreviews();
      if (renderAllObjects) renderAllObjects();

      const updated = state.objects.find(o => o.id === currentObjectId);
      if (updated) {
        drawSelectionHighlight(updated);
        createHandles(updated);
      }
    });

    uiLayer.add(handle);
    handles.push(handle);
  });
}

// --- Rectangle Handles (8 anchors) ---

const RECT_HANDLE_POSITIONS = [
  { name: 'top-left', getX: r => r.x, getY: r => r.y },
  { name: 'top-center', getX: r => r.x + r.width / 2, getY: r => r.y },
  { name: 'top-right', getX: r => r.x + r.width, getY: r => r.y },
  { name: 'middle-left', getX: r => r.x, getY: r => r.y + r.height / 2 },
  { name: 'middle-right', getX: r => r.x + r.width, getY: r => r.y + r.height / 2 },
  { name: 'bottom-left', getX: r => r.x, getY: r => r.y + r.height },
  { name: 'bottom-center', getX: r => r.x + r.width / 2, getY: r => r.y + r.height },
  { name: 'bottom-right', getX: r => r.x + r.width, getY: r => r.y + r.height }
];

function createRectangleHandles(rectObj) {
  RECT_HANDLE_POSITIONS.forEach(pos => {
    const handle = new Konva.Circle({
      x: pos.getX(rectObj),
      y: pos.getY(rectObj),
      radius: screenSize(HANDLE_RADIUS),
      fill: '#528A81',
      stroke: '#2D453E',
      strokeWidth: screenSize(HANDLE_STROKE),
      draggable: true,
      name: 'handle'
    });

    handle.on('dragmove', () => {
      clearAllHighlights(); // Hide highlight during drag
      const snapped = getSnappedPoint(handle.x(), handle.y());
      handle.position(snapped);
      const current = state.objects.find(o => o.id === currentObjectId);
      if (current) updateRectanglePreview(current, pos.name, snapped);
    });

    handle.on('dragend', () => {
      const current = state.objects.find(o => o.id === currentObjectId);
      if (!current) return;

      saveSnapshot();
      const newBounds = calculateRectBounds(current, pos.name, handle.x(), handle.y());
      current.x = newBounds.x;
      current.y = newBounds.y;
      current.width = newBounds.width;
      current.height = newBounds.height;

      clearAllPreviews();
      if (renderAllObjects) renderAllObjects();

      const updated = state.objects.find(o => o.id === currentObjectId);
      if (updated) {
        drawSelectionHighlight(updated);
        createHandles(updated);
      }
    });

    uiLayer.add(handle);
    handles.push(handle);
  });
}

function calculateRectBounds(rect, handleName, newX, newY) {
  let x = rect.x, y = rect.y, width = rect.width, height = rect.height;

  switch (handleName) {
    case 'top-left':
      width = rect.x + rect.width - newX;
      height = rect.y + rect.height - newY;
      x = newX; y = newY;
      break;
    case 'top-center':
      height = rect.y + rect.height - newY;
      y = newY;
      break;
    case 'top-right':
      width = newX - rect.x;
      height = rect.y + rect.height - newY;
      y = newY;
      break;
    case 'middle-left':
      width = rect.x + rect.width - newX;
      x = newX;
      break;
    case 'middle-right':
      width = newX - rect.x;
      break;
    case 'bottom-left':
      width = rect.x + rect.width - newX;
      height = newY - rect.y;
      x = newX;
      break;
    case 'bottom-center':
      height = newY - rect.y;
      break;
    case 'bottom-right':
      width = newX - rect.x;
      height = newY - rect.y;
      break;
  }

  if (width < 10) width = 10;
  if (height < 10) height = 10;
  return { x, y, width, height };
}

// ===== MULTI-SELECT DRAG GROUP =====

let multiSelectGroup = null;
let multiSelectStartPositions = [];

function getMultiSelectBounds(objects) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const obj of objects) {
    if (obj.type === 'wall') {
      minX = Math.min(minX, obj.x1, obj.x2);
      minY = Math.min(minY, obj.y1, obj.y2);
      maxX = Math.max(maxX, obj.x1, obj.x2);
      maxY = Math.max(maxY, obj.y1, obj.y2);
    } else if (obj.type === 'rectangle') {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + obj.width);
      maxY = Math.max(maxY, obj.y + obj.height);
    } else if (obj.type === 'text' || obj.type === 'label') {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + 100);
      maxY = Math.max(maxY, obj.y + 20);
    }
  }
  const pad = screenSize(10);
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
}

function createMultiSelectDragGroup(objects) {
  clearMultiSelectGroup();

  const bounds = getMultiSelectBounds(objects);

  // Store starting positions for all objects
  multiSelectStartPositions = objects.map(obj => {
    if (obj.type === 'wall') {
      return { id: obj.id, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
    } else {
      return { id: obj.id, x: obj.x, y: obj.y };
    }
  });

  // Create invisible drag rect covering all selected objects
  multiSelectGroup = new Konva.Rect({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    fill: 'transparent',
    stroke: '#528A81',
    strokeWidth: screenSize(1),
    dash: [screenSize(8), screenSize(4)],
    draggable: true,
    name: 'multi-select-group'
  });

  const startX = bounds.x;
  const startY = bounds.y;

  multiSelectGroup.on('dragmove', () => {
    const dx = multiSelectGroup.x() - startX;
    const dy = multiSelectGroup.y() - startY;

    // Update all selected objects
    for (const startPos of multiSelectStartPositions) {
      const obj = state.objects.find(o => o.id === startPos.id);
      if (!obj) continue;

      if (obj.type === 'wall') {
        obj.x1 = startPos.x1 + dx;
        obj.y1 = startPos.y1 + dy;
        obj.x2 = startPos.x2 + dx;
        obj.y2 = startPos.y2 + dy;
      } else {
        obj.x = startPos.x + dx;
        obj.y = startPos.y + dy;
      }
    }

    // Update highlights
    const currentObjects = appState.selectedIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
    drawMultiSelectionHighlights(currentObjects);

    if (renderAllObjects) renderAllObjects();
  });

  multiSelectGroup.on('dragend', () => {
    saveSnapshot();

    // Snap final positions
    const dx = multiSelectGroup.x() - startX;
    const dy = multiSelectGroup.y() - startY;
    const snapped = getSnappedPoint(startX + dx, startY + dy);
    const snapDx = snapped.x - startX;
    const snapDy = snapped.y - startY;

    for (const startPos of multiSelectStartPositions) {
      const obj = state.objects.find(o => o.id === startPos.id);
      if (!obj) continue;

      if (obj.type === 'wall') {
        obj.x1 = startPos.x1 + snapDx;
        obj.y1 = startPos.y1 + snapDy;
        obj.x2 = startPos.x2 + snapDx;
        obj.y2 = startPos.y2 + snapDy;
      } else {
        obj.x = startPos.x + snapDx;
        obj.y = startPos.y + snapDy;
      }
    }

    if (renderAllObjects) renderAllObjects();

    // Recreate drag group at new position
    const currentObjects = appState.selectedIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
    drawMultiSelectionHighlights(currentObjects);
    createMultiSelectDragGroup(currentObjects);
  });

  uiLayer.add(multiSelectGroup);
  uiLayer.batchDraw();
}

function clearMultiSelectGroup() {
  if (multiSelectGroup) {
    multiSelectGroup.destroy();
    multiSelectGroup = null;
  }
  multiSelectStartPositions = [];
}

// ===== PREVIEWS =====

let previewShape = null;
let previewLabel = null;
let previewLabel2 = null;

function updateWallPreview(wallObj, endpointIndex, newPos) {
  clearAllPreviews();

  const x1 = endpointIndex === 1 ? newPos.x : wallObj.x1;
  const y1 = endpointIndex === 1 ? newPos.y : wallObj.y1;
  const x2 = endpointIndex === 2 ? newPos.x : wallObj.x2;
  const y2 = endpointIndex === 2 ? newPos.y : wallObj.y2;

  previewShape = new Konva.Line({
    points: [x1, y1, x2, y2],
    stroke: '#528A81',
    strokeWidth: screenSize(WALL_THICKNESS),
    lineCap: 'round',
    opacity: 0.7,
    listening: false
  });
  uiLayer.add(previewShape);

  // Dimension label (screen-space size, clamped to viewport)
  const len = distance(x1, y1, x2, y2);
  const inches = pixelsToInches(len);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  const normAngle = ((angle % 360) + 360) % 360;
  const textRot = (normAngle > 90 && normAngle < 270) ? angle + 180 : angle;
  const fontSize = screenSize(LABEL_FONT_SIZE + 2);
  const labelText = formatDimension(inches);

  // Clamp label to viewport
  const labelPos = clampLabelPosition(x1, y1, x2, y2, midX, midY);

  previewLabel = new Konva.Text({
    x: labelPos.x, y: labelPos.y - screenSize(20),
    text: labelText,
    fontSize: fontSize,
    fill: '#528A81',
    fontStyle: 'bold',
    rotation: textRot,
    offsetX: labelText.length * fontSize * 0.25,
    listening: false
  });
  uiLayer.add(previewLabel);
  uiLayer.batchDraw();
}

function updateRectanglePreview(rectObj, handleName, newPos) {
  clearAllPreviews();

  const newBounds = calculateRectBounds(rectObj, handleName, newPos.x, newPos.y);
  const fontSize = screenSize(LABEL_FONT_SIZE + 2);

  previewShape = new Konva.Rect({
    x: newBounds.x,
    y: newBounds.y,
    width: newBounds.width,
    height: newBounds.height,
    stroke: '#528A81',
    strokeWidth: screenSize(WALL_THICKNESS),
    fill: rectObj.fill || '',
    opacity: 0.7,
    listening: false
  });
  uiLayer.add(previewShape);

  // Dimension labels (screen-space size)
  const widthText = formatDimension(pixelsToInches(newBounds.width));
  const heightText = formatDimension(pixelsToInches(newBounds.height));

  previewLabel = new Konva.Text({
    x: newBounds.x + newBounds.width / 2,
    y: newBounds.y + newBounds.height + screenSize(8),
    text: widthText,
    fontSize: fontSize,
    fill: '#528A81',
    fontStyle: 'bold',
    offsetX: widthText.length * fontSize * 0.25,
    listening: false
  });

  previewLabel2 = new Konva.Text({
    x: newBounds.x + newBounds.width + screenSize(15),
    y: newBounds.y + newBounds.height / 2 + heightText.length * fontSize * 0.25,
    text: heightText,
    fontSize: fontSize,
    fill: '#528A81',
    fontStyle: 'bold',
    rotation: -90,
    listening: false
  });

  uiLayer.add(previewLabel, previewLabel2);
  uiLayer.batchDraw();
}

function clearAllPreviews() {
  if (previewShape) { previewShape.destroy(); previewShape = null; }
  if (previewLabel) { previewLabel.destroy(); previewLabel = null; }
  if (previewLabel2) { previewLabel2.destroy(); previewLabel2 = null; }
}

// ===== DELETE =====

export function deleteSelectedObject() {
  // Handle multi-selection
  if (appState.selectedIds.length > 0) {
    saveSnapshot();
    const count = appState.selectedIds.length;
    for (const id of appState.selectedIds) {
      const idx = state.objects.findIndex(o => o.id === id);
      if (idx !== -1) state.objects.splice(idx, 1);
    }
    deselectObject();
    if (renderAllObjects) renderAllObjects();
    updateStatusBar(`Deleted ${count} objects`);
    return;
  }

  // Handle single selection
  if (!appState.selectedId) return;

  saveSnapshot();
  const idx = state.objects.findIndex(o => o.id === appState.selectedId);
  if (idx !== -1) {
    state.objects.splice(idx, 1);
    deselectObject();
    if (renderAllObjects) renderAllObjects();
    updateStatusBar('Object deleted');
  }
}

export function deleteObjectById(id) {
  saveSnapshot();
  const idx = state.objects.findIndex(o => o.id === id);
  if (idx !== -1) {
    if (appState.selectedId === id) deselectObject();
    state.objects.splice(idx, 1);
    if (renderAllObjects) renderAllObjects();
    updateStatusBar('Object deleted');
  }
}

// ===== BOX SELECTION =====

let boxSelectStart = null;
let boxSelectRect = null;

export function startBoxSelect(x, y) {
  boxSelectStart = { x, y };
  boxSelectRect = new Konva.Rect({
    x, y, width: 0, height: 0,
    stroke: '#528A81',
    strokeWidth: screenSize(1),
    dash: [screenSize(4), screenSize(4)],
    fill: 'rgba(82, 138, 129, 0.1)',
    listening: false
  });
  uiLayer.add(boxSelectRect);
  uiLayer.batchDraw();
}

export function updateBoxSelect(x, y) {
  if (!boxSelectStart || !boxSelectRect) return;

  const minX = Math.min(boxSelectStart.x, x);
  const minY = Math.min(boxSelectStart.y, y);
  const maxX = Math.max(boxSelectStart.x, x);
  const maxY = Math.max(boxSelectStart.y, y);

  boxSelectRect.x(minX);
  boxSelectRect.y(minY);
  boxSelectRect.width(maxX - minX);
  boxSelectRect.height(maxY - minY);
  uiLayer.batchDraw();
}

export function endBoxSelect(x, y) {
  if (!boxSelectStart || !boxSelectRect) return;

  const minX = Math.min(boxSelectStart.x, x);
  const minY = Math.min(boxSelectStart.y, y);
  const maxX = Math.max(boxSelectStart.x, x);
  const maxY = Math.max(boxSelectStart.y, y);

  const selectedObjects = state.objects.filter(obj => {
    // Skip objects on locked/hidden layers
    if (!isObjectEditable(obj)) return false;

    if (obj.type === 'wall') {
      const p1In = obj.x1 >= minX && obj.x1 <= maxX && obj.y1 >= minY && obj.y1 <= maxY;
      const p2In = obj.x2 >= minX && obj.x2 <= maxX && obj.y2 >= minY && obj.y2 <= maxY;
      return p1In || p2In;
    } else if (obj.type === 'rectangle') {
      return !(obj.x > maxX || obj.x + obj.width < minX || obj.y > maxY || obj.y + obj.height < minY);
    } else if (obj.type === 'text' || obj.type === 'label') {
      return obj.x >= minX && obj.x <= maxX && obj.y >= minY && obj.y <= maxY;
    }
    return false;
  });

  boxSelectRect.destroy();
  boxSelectRect = null;
  boxSelectStart = null;
  uiLayer.batchDraw();

  if (selectedObjects.length > 0) {
    selectObjects(selectedObjects.map(o => o.id));
  }

  return selectedObjects;
}

export function cancelBoxSelect() {
  if (boxSelectRect) {
    boxSelectRect.destroy();
    boxSelectRect = null;
  }
  boxSelectStart = null;
  uiLayer.batchDraw();
}

export function isBoxSelecting() {
  return boxSelectStart !== null;
}

// ===== COPY / PASTE =====

let clipboard = [];
const PASTE_OFFSET = 20; // Offset in pixels for pasted objects

export function copySelection() {
  const objectsToCopy = [];

  // Gather objects from multi-selection or single selection
  if (appState.selectedIds.length > 0) {
    for (const id of appState.selectedIds) {
      const obj = state.objects.find(o => o.id === id);
      if (obj) objectsToCopy.push(obj);
    }
  } else if (appState.selectedId) {
    const obj = state.objects.find(o => o.id === appState.selectedId);
    if (obj) objectsToCopy.push(obj);
  }

  if (objectsToCopy.length === 0) {
    updateStatusBar('Nothing to copy');
    return;
  }

  // Deep clone objects to clipboard
  clipboard = objectsToCopy.map(obj => JSON.parse(JSON.stringify(obj)));
  updateStatusBar(`Copied ${clipboard.length} object${clipboard.length > 1 ? 's' : ''}`);
}

export function pasteSelection() {
  if (clipboard.length === 0) {
    updateStatusBar('Nothing to paste');
    return;
  }

  saveSnapshot();

  const newIds = [];
  const offset = screenSize(PASTE_OFFSET);

  for (const template of clipboard) {
    const newObj = JSON.parse(JSON.stringify(template));
    newObj.id = generateUUID();
    newObj.layerId = appState.activeLayerId; // Paste to active layer

    // Offset position so pasted objects don't overlap originals
    if (newObj.type === 'wall') {
      newObj.x1 += offset;
      newObj.y1 += offset;
      newObj.x2 += offset;
      newObj.y2 += offset;
    } else {
      newObj.x += offset;
      newObj.y += offset;
    }

    state.objects.push(newObj);
    newIds.push(newObj.id);
  }

  if (renderAllObjects) renderAllObjects();

  // Select the pasted objects
  selectObjects(newIds);

  updateStatusBar(`Pasted ${newIds.length} object${newIds.length > 1 ? 's' : ''}`);
}

export function hasClipboard() {
  return clipboard.length > 0;
}
