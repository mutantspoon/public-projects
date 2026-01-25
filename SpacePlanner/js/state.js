// js/state.js - State management

import { SCALE } from './constants.js';

export const DEFAULT_LAYER_ID = 'layer-1';

export const state = {
  version: '1.1',
  scale: SCALE,
  objects: [],
  layers: [
    { id: DEFAULT_LAYER_ID, name: 'Layer 1', visible: true, locked: false, order: 0 }
  ]
};

export const appState = {
  currentTool: 'select',
  selectedId: null,
  selectedIds: [],
  drawingMode: false,
  tempStartPoint: null,
  gridVisible: true,
  dimensionsVisible: true,
  activeLayerId: DEFAULT_LAYER_ID,
  hoveredId: null,
  isPanning: false,
  lastPanPoint: null,
  spacePressed: false,
  shiftPressed: false,
  ctrlPressed: false,
  metaPressed: false,
  isErasing: false,
  erasedIds: new Set(),
  middleMouseUsed: false,
  isBoxSelecting: false,
  boxSelectStart: null,
  rectangleColor: '#2C3338',
  rectangleFilled: false
};

export const history = { undoStack: [], redoStack: [], maxSize: 50 };

// Layer helpers
export function getLayerById(id) {
  return state.layers.find(l => l.id === id);
}

export function getActiveLayer() {
  return getLayerById(appState.activeLayerId);
}

export function isLayerEditable(layerId) {
  const layer = getLayerById(layerId);
  return layer && layer.visible && !layer.locked;
}

export function isObjectEditable(obj) {
  if (!obj) return false;
  const layerId = obj.layerId || DEFAULT_LAYER_ID;
  return isLayerEditable(layerId);
}
