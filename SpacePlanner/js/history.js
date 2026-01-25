// js/history.js - Undo/redo system

import { state, history } from './state.js';
import { updateStatusBar } from './utils.js';

// Will be set by app.js to avoid circular dependency
let renderAllObjectsCallback = null;

export function setHistoryCallbacks(callbacks) {
  renderAllObjectsCallback = callbacks.renderAllObjects;
}

export function saveSnapshot() {
  history.undoStack.push(JSON.parse(JSON.stringify(state.objects)));
  if (history.undoStack.length > history.maxSize) history.undoStack.shift();
  history.redoStack = [];
  updateUndoRedoButtons();
}

export function undo() {
  if (history.undoStack.length === 0) return;
  history.redoStack.push(JSON.parse(JSON.stringify(state.objects)));
  state.objects = history.undoStack.pop();
  if (renderAllObjectsCallback) renderAllObjectsCallback();
  updateUndoRedoButtons();
  updateStatusBar('Undo applied');
}

export function redo() {
  if (history.redoStack.length === 0) return;
  history.undoStack.push(JSON.parse(JSON.stringify(state.objects)));
  state.objects = history.redoStack.pop();
  if (renderAllObjectsCallback) renderAllObjectsCallback();
  updateUndoRedoButtons();
  updateStatusBar('Redo applied');
}

export function updateUndoRedoButtons() {
  const undoBtn = document.getElementById('undo-btn');
  const redoBtn = document.getElementById('redo-btn');
  if (undoBtn) undoBtn.disabled = history.undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = history.redoStack.length === 0;
}
