// js/ui-helpers.js - UI helper functions

import { COLOR_PALETTE } from './constants.js';
import { appState, state } from './state.js';
import { uiLayer, contentLayer } from './konva-setup.js';
import { saveSnapshot } from './history.js';

export const clearGhostShapes = () => {
  uiLayer.destroyChildren();
  uiLayer.batchDraw();
};

export const getCursorForTool = tool => ({
  wall: 'crosshair',
  rectangle: 'crosshair',
  text: 'text',
  eraser: 'not-allowed'
}[tool] || 'default');

export const getStatusForTool = tool => ({
  select: 'Select tool | Click objects to select',
  wall: 'Wall tool | Click to start, click to finish',
  rectangle: 'Rectangle tool | Click to start, click for opposite corner',
  text: 'Text tool | Click to add label',
  eraser: 'Eraser | Click or drag to delete'
}[tool] || '');

export const showDimensionPanel = show => {
  document.getElementById('dimension-panel').classList.toggle('hidden', !show);
  if (!show) document.getElementById('dimension-input').value = '';
};

export const showRectanglePanel = show => {
  document.getElementById('rectangle-panel').classList.toggle('hidden', !show);
};

export function initializeColorPalette() {
  const palette = document.getElementById('color-palette');
  palette.innerHTML = '';

  COLOR_PALETTE.forEach(color => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (color === appState.rectangleColor ? ' selected' : '');
    swatch.style.backgroundColor = color;
    swatch.onclick = () => {
      appState.rectangleColor = color;
      updateColorSelection(color);
      if (appState.selectedId) {
        const obj = state.objects.find(o => o.id === appState.selectedId);
        if (obj?.type === 'rectangle') {
          saveSnapshot();
          obj.stroke = color;
          if (obj.fill) obj.fill = color;
          const shape = contentLayer.findOne('#' + obj.id);
          if (shape) {
            shape.stroke(color);
            if (shape.fill()) shape.fill(color);
            contentLayer.batchDraw();
          }
        }
      }
    };
    palette.appendChild(swatch);
  });
}

export function updateColorSelection(selectedColor) {
  const palette = document.getElementById('color-palette');
  palette.querySelectorAll('.color-swatch').forEach((swatch, i) => {
    swatch.classList.toggle('selected', COLOR_PALETTE[i] === selectedColor);
  });
}

// Layer callbacks - set by app.js
let layerCallbacks = { renderAllObjects: null, saveSnapshot: null };

export function setLayerCallbacks(cb) {
  layerCallbacks = { ...layerCallbacks, ...cb };
}

export function moveSelectedUp() {
  if (!appState.selectedId) return false;
  const idx = state.objects.findIndex(o => o.id === appState.selectedId);
  if (idx === -1 || idx === state.objects.length - 1) return false; // Already at top

  if (layerCallbacks.saveSnapshot) layerCallbacks.saveSnapshot();
  const obj = state.objects.splice(idx, 1)[0];
  state.objects.splice(idx + 1, 0, obj);
  if (layerCallbacks.renderAllObjects) layerCallbacks.renderAllObjects();
  return true;
}

export function moveSelectedDown() {
  if (!appState.selectedId) return false;
  const idx = state.objects.findIndex(o => o.id === appState.selectedId);
  if (idx <= 0) return false; // Already at bottom (idx 0) or not found

  if (layerCallbacks.saveSnapshot) layerCallbacks.saveSnapshot();
  const obj = state.objects.splice(idx, 1)[0];
  state.objects.splice(idx - 1, 0, obj);
  if (layerCallbacks.renderAllObjects) layerCallbacks.renderAllObjects();
  return true;
}
