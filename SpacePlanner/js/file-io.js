// js/file-io.js - File save/load/export

import { SCALE } from './constants.js';
import { state, appState, history, DEFAULT_LAYER_ID } from './state.js';
import { stage, gridLayer, uiLayer, contentLayer } from './konva-setup.js';
import { updateStatusBar } from './utils.js';
import { updateUndoRedoButtons } from './history.js';

const BACKGROUND_COLOR = '#F2F1EF';

// Callbacks set by app.js
let callbacks = {
  renderAllObjects: null,
  deselectObject: null,
  renderLayerPanel: null
};

export function setFileIOCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

export function newLayout() {
  if (state.objects.length > 0) {
    if (!confirm('Create new layout? Unsaved changes will be lost.')) return;
  }

  state.objects = [];
  state.layers = [
    { id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false, order: 0 }
  ];
  appState.activeLayerId = DEFAULT_LAYER_ID;
  history.undoStack = [];
  history.redoStack = [];
  updateUndoRedoButtons();

  if (callbacks.deselectObject) callbacks.deselectObject();
  if (callbacks.renderLayerPanel) callbacks.renderLayerPanel();
  if (callbacks.renderAllObjects) callbacks.renderAllObjects();
  updateStatusBar('New layout created');
}

export async function saveLayout() {
  const data = {
    version: state.version,
    scale: SCALE,
    unit: 'inches',
    created: new Date().toISOString(),
    layers: state.layers,
    objects: state.objects
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });

  // Try File System Access API for save dialog
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'floor-plan.layout',
        types: [{
          description: 'Layout File',
          accept: { 'application/json': ['.layout'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      updateStatusBar('Saved: ' + handle.name);
      return;
    } catch (err) {
      // User cancelled or API failed, fall through to legacy download
      if (err.name === 'AbortError') {
        updateStatusBar('Save cancelled');
        return;
      }
    }
  }

  // Fallback: legacy download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'floor-plan.layout';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  updateStatusBar('Layout saved');
}

export function loadLayout() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.layout,.json';
  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.objects && Array.isArray(data.objects)) {
          state.objects = data.objects;

          // Load layers or create default (backward compatibility)
          if (data.layers && Array.isArray(data.layers) && data.layers.length > 0) {
            state.layers = data.layers;
            appState.activeLayerId = state.layers[0].id;
          } else {
            // Old file without layers - create default and assign all objects
            state.layers = [
              { id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false, order: 0 }
            ];
            appState.activeLayerId = DEFAULT_LAYER_ID;
            // Assign existing objects to default layer
            state.objects.forEach(obj => {
              if (!obj.layerId) obj.layerId = DEFAULT_LAYER_ID;
            });
          }

          history.undoStack = [];
          history.redoStack = [];
          updateUndoRedoButtons();

          if (callbacks.deselectObject) callbacks.deselectObject();
          if (callbacks.renderLayerPanel) callbacks.renderLayerPanel();
          if (callbacks.renderAllObjects) callbacks.renderAllObjects();
          updateStatusBar(`Loaded: ${file.name}`);
        } else {
          throw new Error('Invalid layout file');
        }
      } catch (err) {
        alert('Failed to load layout: ' + err.message);
        updateStatusBar('Load failed');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

export async function exportPNG() {
  // Hide grid and UI layers, show only content
  const gridWasVisible = gridLayer.visible();
  const uiWasVisible = uiLayer.visible();
  gridLayer.visible(false);
  uiLayer.visible(false);

  // Add background rectangle behind content
  const bgRect = new Konva.Rect({
    x: -10000,
    y: -10000,
    width: 20000,
    height: 20000,
    fill: BACKGROUND_COLOR,
    listening: false
  });
  contentLayer.add(bgRect);
  bgRect.moveToBottom();
  contentLayer.batchDraw();

  // Generate image
  const dataURL = stage.toDataURL({
    pixelRatio: 2,
    mimeType: 'image/png'
  });

  // Remove background and restore layers
  bgRect.destroy();
  gridLayer.visible(gridWasVisible);
  uiLayer.visible(uiWasVisible);
  contentLayer.batchDraw();

  // Convert dataURL to blob for save dialog
  const response = await fetch(dataURL);
  const blob = await response.blob();

  // Try File System Access API for save dialog
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'floor-plan.png',
        types: [{
          description: 'PNG Image',
          accept: { 'image/png': ['.png'] }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      updateStatusBar('Exported PNG: ' + handle.name);
      return;
    } catch (err) {
      // User cancelled or API failed, fall through to legacy download
      if (err.name === 'AbortError') {
        updateStatusBar('Export cancelled');
        return;
      }
    }
  }

  // Fallback: legacy download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'floor-plan.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  updateStatusBar('Exported PNG');
}
