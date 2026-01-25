// js/tools/text-tool.js - Text/label tool

import { appState, state, getActiveLayer } from '../state.js';
import { contentLayer } from '../konva-setup.js';
import { generateUUID, updateStatusBar } from '../utils.js';
import { getSnappedPoint } from '../snapping.js';
import { saveSnapshot } from '../history.js';

// Callbacks set by app.js
let callbacks = {
  renderAllObjects: null,
  moveTextToTop: null
};

export function setTextToolCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

export function handleTextClick(x, y) {
  // Check if active layer is editable
  const activeLayer = getActiveLayer();
  if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
    updateStatusBar(`Cannot draw: layer "${activeLayer?.name || 'unknown'}" is ${activeLayer?.locked ? 'locked' : 'hidden'}`);
    return;
  }

  const snapped = getSnappedPoint(x, y);
  const content = prompt('Enter label text:');
  if (content && content.trim()) {
    saveSnapshot();
    state.objects.push({
      type: 'label',
      id: generateUUID(),
      layerId: appState.activeLayerId,
      x: snapped.x,
      y: snapped.y,
      content: content.trim(),
      fontSize: 14,
      color: '#2C3338',
      fontStyle: 'bold'
    });
    if (callbacks.renderAllObjects) callbacks.renderAllObjects();
    if (callbacks.moveTextToTop) callbacks.moveTextToTop();
    updateStatusBar('Label added');
  }
}

export function handleTextEdit(id) {
  const obj = state.objects.find(o => o.id === id);
  if (!obj || (obj.type !== 'text' && obj.type !== 'label')) return;

  const newContent = prompt('Edit label text:', obj.content);
  if (newContent !== null && newContent.trim() && newContent !== obj.content) {
    saveSnapshot();
    obj.content = newContent.trim();
    const shape = contentLayer.findOne('#' + id);
    if (shape) {
      shape.text(newContent.trim());
      contentLayer.batchDraw();
    }
    updateStatusBar('Label updated');
  }
}
