// js/app.js - Main application entry point

import { WALL_THICKNESS } from './constants.js';
import { appState, state, history, DEFAULT_LAYER_ID } from './state.js';
import { initializeKonva, stage, gridLayer, contentLayer, uiLayer, getCanvasPointerPosition } from './konva-setup.js';
import { updateStatusBar, isMac, isModKey, pixelsToInches, inchesToPixels, parseDimension, formatDimension } from './utils.js';
import { drawGrid, handleZoom, resetView, handleResize, setGridCallbacks } from './grid.js';
import { getSnappedPoint, getAxisLock, findNearestVertex, snapToGrid, snapPointToGrid } from './snapping.js';
import { saveSnapshot, undo, redo, updateUndoRedoButtons, setHistoryCallbacks } from './history.js';
import { renderAllObjects, renderObject, moveTextToTop, setRenderingCallbacks } from './rendering.js';
import {
  selectObject, deselectObject, deleteSelectedObject, deleteObjectById,
  startBoxSelect, updateBoxSelect, endBoxSelect, cancelBoxSelect, isBoxSelecting,
  setSelectionCallbacks, copySelection, pasteSelection
} from './selection.js';
import { handleWallClick, handleWallMove, clearWallGhost, resetWallTool, getWallStart, setWallToolCallbacks } from './tools/wall-tool.js';
import { handleRectangleClick, handleRectangleMove, clearRectangleGhost, resetRectangleTool, getRectStart, setRectangleToolCallbacks } from './tools/rectangle-tool.js';
import { handleTextClick, handleTextEdit, setTextToolCallbacks } from './tools/text-tool.js';
import { newLayout, saveLayout, loadLayout, exportPNG, setFileIOCallbacks } from './file-io.js';
import { handleKeyDown, handleKeyUp, setKeyboardCallbacks } from './keyboard.js';
import { clearGhostShapes, getCursorForTool, getStatusForTool, showDimensionPanel, showRectanglePanel, initializeColorPalette, updateColorSelection, setLayerCallbacks, moveSelectedUp, moveSelectedDown } from './ui-helpers.js';
import { renderLayerPanel, setLayerPanelCallbacks, addLayer, hideContextMenu, handleContextMenuAction, moveSelectedToActiveLayer, updateMoveToLayerButton } from './layer-panel.js';

// Initialize Konva
initializeKonva();

// ===== WIRE UP CALLBACKS =====
// Simplified: selection.js now owns all selection UI, no more handle callbacks

setHistoryCallbacks({
  renderAllObjects
});

setRenderingCallbacks({
  onDelete: deleteObjectById,
  onSelect: selectObject,
  onWallClick: () => {
    const pos = getCanvasPointerPosition();
    if (pos) handleWallClick(pos.x, pos.y);
  },
  onRectClick: () => {
    const pos = getCanvasPointerPosition();
    if (pos) handleRectangleClick(pos.x, pos.y);
  },
  onTextClick: () => {
    const pos = getCanvasPointerPosition();
    if (pos) handleTextClick(pos.x, pos.y);
  },
  onTextEdit: handleTextEdit,
  getCursorForTool,
  getStatusForTool,
  updateStatusBar
});

// Selection now owns all selection UI - just needs render and panel callbacks
setSelectionCallbacks({
  renderAllObjects,
  showRectanglePanel,
  updateRectanglePanelFromSelection,
  updateMoveToLayerButton
});

// Tool modules just need render callbacks for creating new objects
setWallToolCallbacks({
  renderAllObjects,
  moveTextToTop
});

setRectangleToolCallbacks({
  renderAllObjects,
  moveTextToTop
});

setTextToolCallbacks({
  renderAllObjects,
  moveTextToTop
});

setFileIOCallbacks({
  renderAllObjects,
  deselectObject,
  renderLayerPanel
});

setKeyboardCallbacks({
  deleteSelectedObject,
  switchTool,
  newLayout,
  saveLayout,
  loadLayout,
  exportPNG,
  copySelection,
  pasteSelection
});

setLayerCallbacks({
  renderAllObjects,
  saveSnapshot
});

setLayerPanelCallbacks({
  renderAllObjects,
  deselectObject
});

setGridCallbacks({
  renderAllObjects
});

// ===== TOOL SWITCHING =====
function switchTool(tool) {
  appState.currentTool = tool;
  clearGhostShapes();
  resetWallTool();
  resetRectangleTool();
  deselectObject();

  document.querySelectorAll('.tool-button').forEach(btn => {
    const isActive = btn.dataset.tool === tool;
    btn.classList.toggle('active', isActive);
    btn.classList.toggle('bg-sage-400', isActive);
    btn.classList.toggle('text-cream-100', isActive);
    btn.classList.toggle('border-sage-400', isActive);
    btn.classList.toggle('bg-cream-100', !isActive);
    btn.classList.toggle('text-slate-700', !isActive);
    btn.classList.toggle('border-cream-300', !isActive);
  });

  // Make all shapes draggable in select mode (walls, rects, text)
  contentLayer.find('Text, Rect, Group').forEach(shape => {
    shape.draggable(tool === 'select');
  });
  showRectanglePanel(tool === 'rectangle');
  document.body.style.cursor = getCursorForTool(tool);
  updateStatusBar(getStatusForTool(tool));
}

// ===== HELPER FUNCTIONS =====
function updateRectanglePanelFromSelection(obj) {
  if (obj.type !== 'rectangle') return;

  appState.rectangleColor = obj.stroke || '#2C3338';
  appState.rectangleFilled = !!obj.fill;
  document.getElementById('rect-fill').checked = appState.rectangleFilled;
  updateColorSelection(appState.rectangleColor);

  // Update dimension inputs
  const widthInput = document.getElementById('rect-width-input');
  const heightInput = document.getElementById('rect-height-input');
  if (widthInput) widthInput.value = formatDimension(pixelsToInches(obj.width));
  if (heightInput) heightInput.value = formatDimension(pixelsToInches(obj.height));
}

function updateDimensionInput(obj) {
  const input = document.getElementById('dimension-input');
  if (obj.type === 'wall') {
    const len = Math.sqrt((obj.x2 - obj.x1) ** 2 + (obj.y2 - obj.y1) ** 2);
    input.value = formatDimension(pixelsToInches(len));
  }
}

function drawSmartGuideLines(snapped, guides) {
  if (guides.x !== null) {
    uiLayer.add(new Konva.Line({
      points: [guides.x, -10000, guides.x, 10000],
      stroke: '#C88132', strokeWidth: 1, dash: [4, 4], opacity: 0.7
    }));
  }
  if (guides.y !== null) {
    uiLayer.add(new Konva.Line({
      points: [-10000, guides.y, 10000, guides.y],
      stroke: '#C88132', strokeWidth: 1, dash: [4, 4], opacity: 0.7
    }));
  }
}

// ===== STAGE EVENTS =====
stage.on('wheel', handleZoom);

stage.on('click tap', e => {
  if (appState.middleMouseUsed) { appState.middleMouseUsed = false; return; }
  if (e.target !== stage) return;

  const pos = getCanvasPointerPosition();
  if (!pos) return;

  if (appState.currentTool === 'select') deselectObject();
  else if (appState.currentTool === 'wall') handleWallClick(pos.x, pos.y);
  else if (appState.currentTool === 'rectangle') handleRectangleClick(pos.x, pos.y);
  else if (appState.currentTool === 'text') handleTextClick(pos.x, pos.y);
});

stage.on('mousemove', e => {
  const screenPos = stage.getPointerPosition();
  if (!screenPos) return;

  if (appState.isPanning && appState.lastPanPoint) {
    stage.position({
      x: stage.x() + screenPos.x - appState.lastPanPoint.x,
      y: stage.y() + screenPos.y - appState.lastPanPoint.y
    });
    stage.batchDraw();
    drawGrid();
    // Re-render to update clamped dimension labels
    renderAllObjects();
    appState.lastPanPoint = screenPos;
    return;
  }

  const pos = getCanvasPointerPosition();
  if (!pos) return;

  if (appState.isErasing && appState.hoveredId && !appState.erasedIds.has(appState.hoveredId)) {
    appState.erasedIds.add(appState.hoveredId);
    const idx = state.objects.findIndex(o => o.id === appState.hoveredId);
    if (idx !== -1) {
      state.objects.splice(idx, 1);
      renderAllObjects();
    }
  }

  if (appState.currentTool === 'wall') handleWallMove(pos.x, pos.y);
  else if (appState.currentTool === 'rectangle') handleRectangleMove(pos.x, pos.y);
  else if (isBoxSelecting()) updateBoxSelect(pos.x, pos.y);
});

stage.on('mousedown touchstart', e => {
  if (e.evt.button === 1 || (appState.spacePressed && e.target === stage)) {
    e.evt.preventDefault();
    appState.isPanning = true;
    appState.middleMouseUsed = e.evt.button === 1;
    appState.lastPanPoint = stage.getPointerPosition();
    document.body.style.cursor = 'grabbing';
    updateStatusBar('Panning...');
    return;
  }

  if (appState.currentTool === 'eraser') {
    appState.isErasing = true;
    appState.erasedIds.clear();
    saveSnapshot();
    updateStatusBar('Erasing...');
  }

  if (appState.currentTool === 'select' && e.target === stage && e.evt.button === 0) {
    const pos = getCanvasPointerPosition();
    if (pos) startBoxSelect(pos.x, pos.y);
  }
});

stage.on('mouseup touchend', () => {
  if (appState.isPanning) {
    appState.isPanning = false;
    appState.lastPanPoint = null;
    document.body.style.cursor = getCursorForTool(appState.currentTool);
    updateStatusBar(getStatusForTool(appState.currentTool));
    return;
  }

  if (appState.isErasing) {
    appState.isErasing = false;
    if (appState.erasedIds.size > 0) {
      updateStatusBar(`Erased ${appState.erasedIds.size} object(s)`);
    } else {
      updateStatusBar(getStatusForTool(appState.currentTool));
    }
    appState.erasedIds.clear();
  }

  if (isBoxSelecting()) {
    const pos = getCanvasPointerPosition();
    if (pos) endBoxSelect(pos.x, pos.y);
    else cancelBoxSelect();
  }
});

// ===== DOM EVENTS =====
document.querySelectorAll('.tool-button').forEach(btn => {
  btn.addEventListener('click', () => switchTool(btn.dataset.tool));
});

document.getElementById('grid-toggle').addEventListener('click', () => {
  appState.gridVisible = !appState.gridVisible;
  gridLayer.visible(appState.gridVisible);
  drawGrid();
  updateStatusBar(`Grid ${appState.gridVisible ? 'shown' : 'hidden'}`);
});

document.getElementById('dimensions-toggle').addEventListener('click', () => {
  appState.dimensionsVisible = !appState.dimensionsVisible;
  renderAllObjects();
  updateStatusBar(`Dimensions ${appState.dimensionsVisible ? 'shown' : 'hidden'}`);
});

document.getElementById('reset-view').addEventListener('click', resetView);
document.getElementById('undo-btn').addEventListener('click', undo);
document.getElementById('redo-btn').addEventListener('click', redo);
document.getElementById('move-up-btn').addEventListener('click', () => {
  if (moveSelectedUp()) updateStatusBar('Moved up');
});
document.getElementById('move-down-btn').addEventListener('click', () => {
  if (moveSelectedDown()) updateStatusBar('Moved down');
});
document.getElementById('new-btn').addEventListener('click', newLayout);
document.getElementById('save-btn').addEventListener('click', saveLayout);
document.getElementById('load-btn').addEventListener('click', loadLayout);
document.getElementById('export-btn').addEventListener('click', exportPNG);

// Layer panel events
document.getElementById('add-layer-btn').addEventListener('click', addLayer);
document.getElementById('move-to-layer-btn').addEventListener('click', moveSelectedToActiveLayer);

// Layer context menu
document.querySelectorAll('.layer-menu-item').forEach(item => {
  item.addEventListener('click', () => handleContextMenuAction(item.dataset.action));
});

// Close context menu on click outside
document.addEventListener('click', e => {
  if (!e.target.closest('#layer-context-menu') && !e.target.closest('.layer-menu-btn')) {
    hideContextMenu();
  }
});

document.getElementById('file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const data = JSON.parse(evt.target.result);
      if (!data.objects || !Array.isArray(data.objects)) {
        alert('Invalid layout file');
        return;
      }
      state.objects = data.objects;

      // Load layers or create default (backward compatibility)
      if (data.layers && Array.isArray(data.layers) && data.layers.length > 0) {
        state.layers = data.layers;
        appState.activeLayerId = state.layers[0].id;
      } else {
        state.layers = [
          { id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false, order: 0 }
        ];
        appState.activeLayerId = DEFAULT_LAYER_ID;
        state.objects.forEach(obj => {
          if (!obj.layerId) obj.layerId = DEFAULT_LAYER_ID;
        });
      }

      history.undoStack = [];
      history.redoStack = [];
      updateUndoRedoButtons();
      deselectObject();
      renderLayerPanel();
      renderAllObjects();
      updateStatusBar(`Loaded: ${file.name}`);
    } catch (err) {
      alert('Error loading file: ' + err.message);
    }
  };
  reader.readAsText(file);
});

document.getElementById('rect-fill').addEventListener('change', e => {
  appState.rectangleFilled = e.target.checked;

  if (appState.selectedId) {
    const obj = state.objects.find(o => o.id === appState.selectedId);
    if (obj?.type === 'rectangle') {
      saveSnapshot();
      obj.fill = e.target.checked ? appState.rectangleColor : '';
      const shape = contentLayer.findOne('#' + obj.id);
      if (shape) {
        shape.fill(e.target.checked ? appState.rectangleColor : '');
        contentLayer.batchDraw();
      }
    }
  }
});

document.getElementById('dimension-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const inches = parseDimension(e.target.value);
    if (!appState.selectedId || inches <= 0) return;

    const obj = state.objects.find(o => o.id === appState.selectedId);
    if (!obj) return;

    saveSnapshot();
    if (obj.type === 'wall') {
      const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
      const px = inchesToPixels(inches);
      obj.x2 = obj.x1 + Math.cos(angle) * px;
      obj.y2 = obj.y1 + Math.sin(angle) * px;
    }
    renderAllObjects();
    updateStatusBar('Dimensions updated');
  }
});

// Rectangle dimension inputs
document.getElementById('rect-width-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const inches = parseDimension(e.target.value);
    if (!appState.selectedId || inches <= 0) return;

    const obj = state.objects.find(o => o.id === appState.selectedId);
    if (!obj || obj.type !== 'rectangle') return;

    saveSnapshot();
    obj.width = inchesToPixels(inches);
    renderAllObjects();
    selectObject(obj.id);
    updateStatusBar('Width updated');
  }
});

document.getElementById('rect-height-input').addEventListener('keypress', e => {
  if (e.key === 'Enter') {
    const inches = parseDimension(e.target.value);
    if (!appState.selectedId || inches <= 0) return;

    const obj = state.objects.find(o => o.id === appState.selectedId);
    if (!obj || obj.type !== 'rectangle') return;

    saveSnapshot();
    obj.height = inchesToPixels(inches);
    renderAllObjects();
    selectObject(obj.id);
    updateStatusBar('Height updated');
  }
});

// Keyboard events
document.addEventListener('keydown', e => {
  const inInput = e.target.matches('input, select, textarea');

  if (e.key === ' ' && !inInput) {
    e.preventDefault();
    if (!appState.spacePressed) {
      appState.spacePressed = true;
      document.body.style.cursor = 'grab';
      updateStatusBar('Pan mode');
    }
    return;
  }

  if (e.key === 'Escape') {
    const isDrawing = getWallStart() !== null || getRectStart() !== null;
    if (isDrawing) {
      clearGhostShapes();
      resetWallTool();
      resetRectangleTool();
      updateStatusBar('Cancelled');
    } else {
      deselectObject();
    }
    return;
  }

  handleKeyDown(e);
});

document.addEventListener('keyup', e => {
  if (e.key === ' ') {
    appState.spacePressed = false;
    if (!appState.isPanning) {
      document.body.style.cursor = getCursorForTool(appState.currentTool);
      updateStatusBar(getStatusForTool(appState.currentTool));
    }
  }
  handleKeyUp(e);
});

window.addEventListener('resize', handleResize);

// Cancel box select if mouse leaves window, window loses focus, or mouseup outside canvas
window.addEventListener('blur', () => {
  if (isBoxSelecting()) cancelBoxSelect();
});
document.addEventListener('mouseleave', () => {
  if (isBoxSelecting()) cancelBoxSelect();
});
// Global mouseup to catch releases on UI elements
document.addEventListener('mouseup', (e) => {
  // If mouseup happens outside the canvas container, cancel box select
  if (isBoxSelecting() && !e.target.closest('#container')) {
    cancelBoxSelect();
  }
});

// ===== INIT =====
initializeColorPalette();
renderLayerPanel();
drawGrid();
updateUndoRedoButtons();
switchTool('select');
updateStatusBar('SpacePlanner ready | Select tool active');
