// js/layer-panel.js - Layer management panel

import { state, appState, DEFAULT_LAYER_ID, getLayerById, getActiveLayer } from './state.js';
import { generateUUID, updateStatusBar } from './utils.js';
import { saveSnapshot } from './history.js';

// Callbacks set by app.js
let callbacks = {
  renderAllObjects: null,
  deselectObject: null
};

export function setLayerPanelCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

// Context menu state
let contextMenuLayerId = null;

// Render the layer list
export function renderLayerPanel() {
  const list = document.getElementById('layer-list');
  list.innerHTML = '';

  // Sort layers by order (highest first so they appear at top of list)
  const sortedLayers = [...state.layers].sort((a, b) => b.order - a.order);

  sortedLayers.forEach(layer => {
    const row = document.createElement('div');
    row.className = 'layer-row' +
      (layer.id === appState.activeLayerId ? ' active' : '') +
      (layer.locked ? ' locked' : '');
    row.dataset.layerId = layer.id;

    // Visibility toggle
    const visIcon = document.createElement('div');
    visIcon.className = 'layer-icon';
    visIcon.innerHTML = layer.visible ? '&#128065;' : '&#128064;'; // eye open/closed
    visIcon.title = layer.visible ? 'Hide layer' : 'Show layer';
    visIcon.onclick = (e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); };

    // Lock toggle
    const lockIcon = document.createElement('div');
    lockIcon.className = 'layer-icon';
    lockIcon.innerHTML = layer.locked ? '&#128274;' : '&#128275;'; // locked/unlocked
    lockIcon.title = layer.locked ? 'Unlock layer' : 'Lock layer';
    lockIcon.onclick = (e) => { e.stopPropagation(); toggleLayerLock(layer.id); };

    // Layer name
    const name = document.createElement('div');
    name.className = 'layer-name';
    name.textContent = layer.name;
    name.title = layer.name;

    // Menu button
    const menuBtn = document.createElement('div');
    menuBtn.className = 'layer-menu-btn';
    menuBtn.innerHTML = '&#8942;'; // vertical ellipsis
    menuBtn.title = 'Layer options';
    menuBtn.onclick = (e) => { e.stopPropagation(); showContextMenu(e, layer.id); };

    row.appendChild(visIcon);
    row.appendChild(lockIcon);
    row.appendChild(name);
    row.appendChild(menuBtn);

    // Click to select layer
    row.onclick = () => selectLayer(layer.id);

    list.appendChild(row);
  });

  updateMoveToLayerButton();
}

export function selectLayer(id) {
  const layer = getLayerById(id);
  if (!layer) return;

  appState.activeLayerId = id;
  renderLayerPanel();
  updateStatusBar(`Active layer: ${layer.name}`);
}

export function toggleLayerVisibility(id) {
  const layer = getLayerById(id);
  if (!layer) return;

  saveSnapshot();
  layer.visible = !layer.visible;

  // If hiding the active layer, deselect any selected objects on it
  if (!layer.visible) {
    deselectObjectsOnLayer(id);
  }

  renderLayerPanel();
  if (callbacks.renderAllObjects) callbacks.renderAllObjects();
  updateStatusBar(`${layer.name}: ${layer.visible ? 'visible' : 'hidden'}`);
}

export function toggleLayerLock(id) {
  const layer = getLayerById(id);
  if (!layer) return;

  saveSnapshot();
  layer.locked = !layer.locked;

  // If locking, deselect any selected objects on it
  if (layer.locked) {
    deselectObjectsOnLayer(id);
  }

  renderLayerPanel();
  if (callbacks.renderAllObjects) callbacks.renderAllObjects();
  updateStatusBar(`${layer.name}: ${layer.locked ? 'locked' : 'unlocked'}`);
}

function deselectObjectsOnLayer(layerId) {
  // Deselect if single selection is on this layer
  if (appState.selectedId) {
    const obj = state.objects.find(o => o.id === appState.selectedId);
    if (obj && (obj.layerId || DEFAULT_LAYER_ID) === layerId) {
      if (callbacks.deselectObject) callbacks.deselectObject();
    }
  }
  // Filter out from multi-selection
  if (appState.selectedIds.length > 0) {
    const remaining = appState.selectedIds.filter(id => {
      const obj = state.objects.find(o => o.id === id);
      return obj && (obj.layerId || DEFAULT_LAYER_ID) !== layerId;
    });
    if (remaining.length !== appState.selectedIds.length) {
      appState.selectedIds = remaining;
      if (callbacks.renderAllObjects) callbacks.renderAllObjects();
    }
  }
}

export function addLayer() {
  saveSnapshot();

  const maxOrder = Math.max(...state.layers.map(l => l.order), -1);
  const layerNum = state.layers.length + 1;
  const newLayer = {
    id: generateUUID(),
    name: `Layer ${layerNum}`,
    visible: true,
    locked: false,
    order: maxOrder + 1
  };

  state.layers.push(newLayer);
  appState.activeLayerId = newLayer.id;

  renderLayerPanel();
  updateStatusBar(`Added ${newLayer.name}`);
}

export function deleteLayer(id) {
  if (state.layers.length <= 1) {
    updateStatusBar('Cannot delete the only layer');
    return;
  }

  const layer = getLayerById(id);
  if (!layer) return;

  saveSnapshot();

  // Move objects to the first other layer
  const targetLayer = state.layers.find(l => l.id !== id);
  state.objects.forEach(obj => {
    if ((obj.layerId || DEFAULT_LAYER_ID) === id) {
      obj.layerId = targetLayer.id;
    }
  });

  // Remove the layer
  const idx = state.layers.findIndex(l => l.id === id);
  state.layers.splice(idx, 1);

  // If active layer was deleted, switch to first layer
  if (appState.activeLayerId === id) {
    appState.activeLayerId = state.layers[0].id;
  }

  renderLayerPanel();
  if (callbacks.renderAllObjects) callbacks.renderAllObjects();
  updateStatusBar(`Deleted ${layer.name}, objects moved to ${targetLayer.name}`);
}

export function renameLayer(id) {
  const layer = getLayerById(id);
  if (!layer) return;

  const newName = prompt('Layer name:', layer.name);
  if (newName && newName.trim() && newName !== layer.name) {
    saveSnapshot();
    layer.name = newName.trim();
    renderLayerPanel();
    updateStatusBar(`Renamed to ${layer.name}`);
  }
}

export function moveLayerUp(id) {
  const layer = getLayerById(id);
  if (!layer) return;

  // Find layer with next higher order
  const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
  const idx = sortedLayers.findIndex(l => l.id === id);
  if (idx >= sortedLayers.length - 1) return; // Already at top

  saveSnapshot();
  const swapWith = sortedLayers[idx + 1];
  const tempOrder = layer.order;
  layer.order = swapWith.order;
  swapWith.order = tempOrder;

  renderLayerPanel();
  if (callbacks.renderAllObjects) callbacks.renderAllObjects();
}

export function moveLayerDown(id) {
  const layer = getLayerById(id);
  if (!layer) return;

  // Find layer with next lower order
  const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
  const idx = sortedLayers.findIndex(l => l.id === id);
  if (idx <= 0) return; // Already at bottom

  saveSnapshot();
  const swapWith = sortedLayers[idx - 1];
  const tempOrder = layer.order;
  layer.order = swapWith.order;
  swapWith.order = tempOrder;

  renderLayerPanel();
  if (callbacks.renderAllObjects) callbacks.renderAllObjects();
}

export function moveSelectedToActiveLayer() {
  const activeLayer = getActiveLayer();
  if (!activeLayer) return;

  if (activeLayer.locked) {
    updateStatusBar(`Cannot move to locked layer: ${activeLayer.name}`);
    return;
  }

  const selectedIds = appState.selectedIds.length > 0
    ? appState.selectedIds
    : (appState.selectedId ? [appState.selectedId] : []);

  if (selectedIds.length === 0) {
    updateStatusBar('No objects selected');
    return;
  }

  saveSnapshot();
  let movedCount = 0;
  selectedIds.forEach(id => {
    const obj = state.objects.find(o => o.id === id);
    if (obj && (obj.layerId || DEFAULT_LAYER_ID) !== activeLayer.id) {
      obj.layerId = activeLayer.id;
      movedCount++;
    }
  });

  if (movedCount > 0) {
    if (callbacks.renderAllObjects) callbacks.renderAllObjects();
    updateStatusBar(`Moved ${movedCount} object(s) to ${activeLayer.name}`);
  } else {
    updateStatusBar('Objects already on active layer');
  }
}

// Context menu
function showContextMenu(e, layerId) {
  contextMenuLayerId = layerId;
  const menu = document.getElementById('layer-context-menu');

  // Position near the click
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
  menu.classList.remove('hidden');

  // Update button states
  const layer = getLayerById(layerId);
  const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
  const idx = sortedLayers.findIndex(l => l.id === layerId);

  menu.querySelector('[data-action="move-up"]').disabled = idx >= sortedLayers.length - 1;
  menu.querySelector('[data-action="move-down"]').disabled = idx <= 0;
  menu.querySelector('[data-action="delete"]').disabled = state.layers.length <= 1;
}

export function hideContextMenu() {
  document.getElementById('layer-context-menu').classList.add('hidden');
  contextMenuLayerId = null;
}

export function handleContextMenuAction(action) {
  if (!contextMenuLayerId) return;

  const id = contextMenuLayerId;
  hideContextMenu();

  switch (action) {
    case 'rename': renameLayer(id); break;
    case 'move-up': moveLayerUp(id); break;
    case 'move-down': moveLayerDown(id); break;
    case 'delete': deleteLayer(id); break;
  }
}

export function updateMoveToLayerButton() {
  const btn = document.getElementById('move-to-layer-btn');
  const hasSelection = appState.selectedId || appState.selectedIds.length > 0;
  btn.disabled = !hasSelection;
}
