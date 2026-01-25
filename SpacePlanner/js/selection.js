// js/selection.js - Simplified Selection Manager
//
// Selection behavior:
// - Walls: Show vertex handles when selected. Drag handles to move endpoints.
//          Drag the wall body to move the entire wall.
// - Rectangles: Just highlight when selected. Drag to move. NO resize handles.
//               Use dimension inputs in the panel instead.
// - Text: Just highlight when selected. Drag to move.

import { WALL_THICKNESS, HANDLE_RADIUS, HANDLE_STROKE, HIGHLIGHT_STROKE, LABEL_FONT_SIZE } from './constants.js';
import { appState, state, isObjectEditable, DEFAULT_LAYER_ID } from './state.js';
import { contentLayer, uiLayer, stage } from './konva-setup.js';
import { saveSnapshot } from './history.js';
import { updateStatusBar, distance, pixelsToInches, formatDimension, generateUUID } from './utils.js';
import { getSnappedPoint, snapPointToGrid } from './snapping.js';

// Screen-space size helper (constant visual size regardless of zoom)
function screenSize(pixels) {
  return pixels / stage.scaleX();
}

// Callbacks set by app.js
let callbacks = {
  renderAllObjects: null,
  showRectanglePanel: null,
  updateRectanglePanelFromSelection: null,
  updateMoveToLayerButton: null
};

export function setSelectionCallbacks(cb) {
  Object.assign(callbacks, cb);
}

// =============================================================================
// SELECTION STATE
// =============================================================================

let highlights = [];
let handles = [];
let currentObjectId = null;

// =============================================================================
// MAIN SELECTION API
// =============================================================================

export function selectObject(id) {
  const obj = state.objects.find(o => o.id === id);
  if (!obj) return;

  if (!isObjectEditable(obj)) {
    updateStatusBar('Cannot select: layer is locked or hidden');
    return;
  }

  // Deselect previous if different
  if (appState.selectedId && appState.selectedId !== id) {
    deselectObject();
  }

  appState.selectedId = id;
  currentObjectId = id;

  // Draw highlight and handles
  drawHighlight(obj);
  if (obj.type === 'wall') {
    createWallHandles(obj);
  }
  // Rectangles and text: NO handles, just highlight

  // Show rectangle panel if applicable
  if (obj.type === 'rectangle') {
    if (callbacks.showRectanglePanel) callbacks.showRectanglePanel(true);
    if (callbacks.updateRectanglePanelFromSelection) callbacks.updateRectanglePanelFromSelection(obj);
  }

  if (callbacks.updateMoveToLayerButton) callbacks.updateMoveToLayerButton();
  updateStatusBar(`Selected: ${obj.type}`);
}

export function deselectObject() {
  clearHighlights();
  clearHandles();
  clearMultiDragGroup();

  if (callbacks.showRectanglePanel) callbacks.showRectanglePanel(false);

  appState.selectedId = null;
  appState.selectedIds = [];
  currentObjectId = null;

  if (callbacks.updateMoveToLayerButton) callbacks.updateMoveToLayerButton();
  uiLayer.batchDraw();
}

// =============================================================================
// HIGHLIGHTS
// =============================================================================

function drawHighlight(obj) {
  clearHighlights();

  const pad = screenSize(4);
  const stroke = screenSize(HIGHLIGHT_STROKE);
  const dash = [screenSize(6), screenSize(4)];

  let highlight = null;

  if (obj.type === 'wall') {
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
      listening: false
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
      listening: false
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
      listening: false
    });
  }

  if (highlight) {
    highlights.push(highlight);
    uiLayer.add(highlight);
    uiLayer.batchDraw();
  }
}

function clearHighlights() {
  highlights.forEach(h => h.destroy());
  highlights = [];
}

// Refresh highlight after object moves
export function refreshHighlight() {
  if (!appState.selectedId) return;
  const obj = state.objects.find(o => o.id === appState.selectedId);
  if (obj) drawHighlight(obj);
}

// =============================================================================
// WALL HANDLES (vertex editing)
// =============================================================================

function createWallHandles(wallObj) {
  clearHandles();

  [1, 2].forEach(endpointIndex => {
    const x = endpointIndex === 1 ? wallObj.x1 : wallObj.x2;
    const y = endpointIndex === 1 ? wallObj.y1 : wallObj.y2;

    const handle = new Konva.Circle({
      x: x,
      y: y,
      radius: screenSize(HANDLE_RADIUS + 2),
      fill: '#528A81',
      stroke: '#2D453E',
      strokeWidth: screenSize(HANDLE_STROKE),
      draggable: true,
      name: 'wall-handle'
    });

    // Track starting position for snapping
    let startX, startY;

    handle.on('dragstart', () => {
      startX = handle.x();
      startY = handle.y();
      clearHighlights(); // Hide highlight during drag
    });

    handle.on('dragmove', () => {
      // Snap handle position to grid
      const snapped = getSnappedPoint(handle.x(), handle.y());
      handle.position(snapped);

      // Show preview of new wall position
      const wall = state.objects.find(o => o.id === currentObjectId);
      if (wall) {
        showWallPreview(wall, endpointIndex, snapped);
      }
    });

    handle.on('dragend', () => {
      const wall = state.objects.find(o => o.id === currentObjectId);
      if (!wall) return;

      saveSnapshot();

      // Update wall endpoint
      const snapped = getSnappedPoint(handle.x(), handle.y());
      if (endpointIndex === 1) {
        wall.x1 = snapped.x;
        wall.y1 = snapped.y;
      } else {
        wall.x2 = snapped.x;
        wall.y2 = snapped.y;
      }

      clearPreview();
      if (callbacks.renderAllObjects) callbacks.renderAllObjects();

      // Refresh selection UI
      const updated = state.objects.find(o => o.id === currentObjectId);
      if (updated) {
        drawHighlight(updated);
        createWallHandles(updated);
      }
    });

    uiLayer.add(handle);
    handles.push(handle);
  });

  uiLayer.batchDraw();
}

function clearHandles() {
  handles.forEach(h => h.destroy());
  handles = [];
}

// Refresh handles after zoom (recreate at new screen size)
export function refreshSelectionUI() {
  if (!appState.selectedId) return;
  const obj = state.objects.find(o => o.id === appState.selectedId);
  if (obj) {
    drawHighlight(obj);
    if (obj.type === 'wall') {
      createWallHandles(obj);
    }
  }
}

// =============================================================================
// WALL PREVIEW (during handle drag)
// =============================================================================

let previewLine = null;
let previewLabel = null;

function showWallPreview(wall, endpointIndex, newPos) {
  clearPreview();

  const x1 = endpointIndex === 1 ? newPos.x : wall.x1;
  const y1 = endpointIndex === 1 ? newPos.y : wall.y1;
  const x2 = endpointIndex === 2 ? newPos.x : wall.x2;
  const y2 = endpointIndex === 2 ? newPos.y : wall.y2;

  previewLine = new Konva.Line({
    points: [x1, y1, x2, y2],
    stroke: '#528A81',
    strokeWidth: screenSize(WALL_THICKNESS),
    lineCap: 'round',
    opacity: 0.7,
    listening: false
  });
  uiLayer.add(previewLine);

  // Dimension label
  const len = distance(x1, y1, x2, y2);
  const inches = pixelsToInches(len);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  const normAngle = ((angle % 360) + 360) % 360;
  const textRot = (normAngle > 90 && normAngle < 270) ? angle + 180 : angle;
  const fontSize = screenSize(LABEL_FONT_SIZE + 2);
  const labelText = formatDimension(inches);

  previewLabel = new Konva.Text({
    x: midX,
    y: midY - screenSize(20),
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

function clearPreview() {
  if (previewLine) { previewLine.destroy(); previewLine = null; }
  if (previewLabel) { previewLabel.destroy(); previewLabel = null; }
}

// =============================================================================
// DELETE
// =============================================================================

export function deleteSelectedObject() {
  if (appState.selectedIds.length > 0) {
    // Multi-selection delete
    saveSnapshot();
    const count = appState.selectedIds.length;
    for (const id of appState.selectedIds) {
      const idx = state.objects.findIndex(o => o.id === id);
      if (idx !== -1) state.objects.splice(idx, 1);
    }
    deselectObject();
    if (callbacks.renderAllObjects) callbacks.renderAllObjects();
    updateStatusBar(`Deleted ${count} objects`);
    return;
  }

  if (!appState.selectedId) return;

  saveSnapshot();
  const idx = state.objects.findIndex(o => o.id === appState.selectedId);
  if (idx !== -1) {
    state.objects.splice(idx, 1);
    deselectObject();
    if (callbacks.renderAllObjects) callbacks.renderAllObjects();
    updateStatusBar('Object deleted');
  }
}

export function deleteObjectById(id) {
  saveSnapshot();
  const idx = state.objects.findIndex(o => o.id === id);
  if (idx !== -1) {
    if (appState.selectedId === id) deselectObject();
    state.objects.splice(idx, 1);
    if (callbacks.renderAllObjects) callbacks.renderAllObjects();
    updateStatusBar('Object deleted');
  }
}

// =============================================================================
// BOX SELECTION
// =============================================================================

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
    if (!isObjectEditable(obj)) return false;

    if (obj.type === 'wall') {
      // Select if either endpoint is in box
      const p1In = obj.x1 >= minX && obj.x1 <= maxX && obj.y1 >= minY && obj.y1 <= maxY;
      const p2In = obj.x2 >= minX && obj.x2 <= maxX && obj.y2 >= minY && obj.y2 <= maxY;
      return p1In || p2In;
    } else if (obj.type === 'rectangle') {
      // Select if rectangles overlap
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

  if (selectedObjects.length === 1) {
    selectObject(selectedObjects[0].id);
  } else if (selectedObjects.length > 1) {
    selectMultiple(selectedObjects.map(o => o.id));
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

// =============================================================================
// MULTI-SELECTION
// =============================================================================

let multiSelectGroup = null;
let multiSelectStartPositions = [];

function selectMultiple(ids) {
  deselectObject();

  const editableIds = ids.filter(id => {
    const obj = state.objects.find(o => o.id === id);
    return obj && isObjectEditable(obj);
  });

  if (editableIds.length === 0) return;
  if (editableIds.length === 1) {
    selectObject(editableIds[0]);
    return;
  }

  appState.selectedIds = editableIds;
  appState.selectedId = null;

  // Draw highlights for all
  const objects = editableIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
  drawMultiHighlights(objects);
  createMultiDragGroup(objects);

  if (callbacks.updateMoveToLayerButton) callbacks.updateMoveToLayerButton();
  updateStatusBar(`Selected ${editableIds.length} objects`);
}

// Expose for external use
export function selectObjects(ids) {
  selectMultiple(ids);
}

function drawMultiHighlights(objects) {
  clearHighlights();
  const pad = screenSize(4);
  const stroke = screenSize(HIGHLIGHT_STROKE);
  const dash = [screenSize(6), screenSize(4)];

  for (const obj of objects) {
    let highlight = null;
    if (obj.type === 'wall') {
      const minX = Math.min(obj.x1, obj.x2);
      const minY = Math.min(obj.y1, obj.y2);
      const maxX = Math.max(obj.x1, obj.x2);
      const maxY = Math.max(obj.y1, obj.y2);
      highlight = new Konva.Rect({
        x: minX - pad, y: minY - pad,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
        stroke: '#528A81', strokeWidth: stroke, dash: dash, listening: false
      });
    } else if (obj.type === 'rectangle') {
      highlight = new Konva.Rect({
        x: obj.x - pad, y: obj.y - pad,
        width: obj.width + pad * 2, height: obj.height + pad * 2,
        stroke: '#528A81', strokeWidth: stroke, dash: dash, listening: false
      });
    } else if (obj.type === 'text' || obj.type === 'label') {
      const shape = contentLayer.findOne('#' + obj.id);
      highlight = new Konva.Rect({
        x: obj.x - pad, y: obj.y - pad,
        width: (shape ? shape.width() : 50) + pad * 2,
        height: (shape ? shape.height() : 20) + pad * 2,
        stroke: '#528A81', strokeWidth: stroke, dash: dash, listening: false
      });
    }
    if (highlight) {
      highlights.push(highlight);
      uiLayer.add(highlight);
    }
  }
  uiLayer.batchDraw();
}

function createMultiDragGroup(objects) {
  clearMultiDragGroup();

  // Calculate bounding box
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
    } else {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + 100);
      maxY = Math.max(maxY, obj.y + 20);
    }
  }

  const pad = screenSize(10);
  const bounds = { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };

  // Store start positions
  multiSelectStartPositions = objects.map(obj => {
    if (obj.type === 'wall') {
      return { id: obj.id, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
    } else {
      return { id: obj.id, x: obj.x, y: obj.y };
    }
  });

  multiSelectGroup = new Konva.Rect({
    x: bounds.x, y: bounds.y,
    width: bounds.width, height: bounds.height,
    fill: 'transparent',
    stroke: '#528A81',
    strokeWidth: screenSize(1),
    dash: [screenSize(8), screenSize(4)],
    draggable: true
  });

  const startX = bounds.x;
  const startY = bounds.y;

  multiSelectGroup.on('dragmove', () => {
    const dx = multiSelectGroup.x() - startX;
    const dy = multiSelectGroup.y() - startY;

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

    const currentObjects = appState.selectedIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
    drawMultiHighlights(currentObjects);
    if (callbacks.renderAllObjects) callbacks.renderAllObjects();
  });

  multiSelectGroup.on('dragend', () => {
    saveSnapshot();

    // Snap to grid
    const dx = multiSelectGroup.x() - startX;
    const dy = multiSelectGroup.y() - startY;
    const snapped = snapPointToGrid(startX + dx, startY + dy);
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

    if (callbacks.renderAllObjects) callbacks.renderAllObjects();

    // Recreate group at new position
    const currentObjects = appState.selectedIds.map(id => state.objects.find(o => o.id === id)).filter(Boolean);
    drawMultiHighlights(currentObjects);
    createMultiDragGroup(currentObjects);
  });

  uiLayer.add(multiSelectGroup);
  uiLayer.batchDraw();
}

function clearMultiDragGroup() {
  if (multiSelectGroup) {
    multiSelectGroup.destroy();
    multiSelectGroup = null;
  }
  multiSelectStartPositions = [];
}

// =============================================================================
// COPY / PASTE
// =============================================================================

let clipboard = [];

export function copySelection() {
  const objectsToCopy = [];

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
  const offset = screenSize(20);

  for (const template of clipboard) {
    const newObj = JSON.parse(JSON.stringify(template));
    newObj.id = generateUUID();
    newObj.layerId = appState.activeLayerId;

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

  if (callbacks.renderAllObjects) callbacks.renderAllObjects();
  selectObjects(newIds);
  updateStatusBar(`Pasted ${newIds.length} object${newIds.length > 1 ? 's' : ''}`);
}

export function hasClipboard() {
  return clipboard.length > 0;
}

// Legacy exports for compatibility
export function updateWallSelectionHighlight() { refreshHighlight(); }
export function updateRectangleSelectionHighlight() { refreshHighlight(); }
