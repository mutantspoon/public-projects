// js/keyboard.js - Keyboard event handlers

import { appState } from './state.js';
import { isModKey, isMac } from './utils.js';
import { undo, redo } from './history.js';

// Callbacks set by app.js
let callbacks = {
  deleteSelectedObject: null,
  switchTool: null,
  newLayout: null,
  saveLayout: null,
  loadLayout: null,
  exportPNG: null,
  copySelection: null,
  pasteSelection: null
};

export function setKeyboardCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

export function handleKeyDown(e) {
  // Track modifier keys
  appState.shiftPressed = e.shiftKey;
  appState.ctrlPressed = e.ctrlKey;
  appState.metaPressed = e.metaKey;

  // Don't intercept if typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  const modKey = isModKey(e);

  // Undo: Ctrl/Cmd + Z
  if (modKey && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }

  // Redo: Ctrl/Cmd + Shift + Z or Ctrl + Y
  if ((modKey && e.shiftKey && e.key === 'z') || (modKey && e.key === 'y')) {
    e.preventDefault();
    redo();
    return;
  }

  // File operations
  if (modKey && e.key === 'n') {
    e.preventDefault();
    if (callbacks.newLayout) callbacks.newLayout();
    return;
  }

  if (modKey && e.key === 's') {
    e.preventDefault();
    if (callbacks.saveLayout) callbacks.saveLayout();
    return;
  }

  if (modKey && e.key === 'o') {
    e.preventDefault();
    if (callbacks.loadLayout) callbacks.loadLayout();
    return;
  }

  if (modKey && e.shiftKey && e.key === 'e') {
    e.preventDefault();
    if (callbacks.exportPNG) callbacks.exportPNG();
    return;
  }

  // Copy: Ctrl/Cmd + C
  if (modKey && e.key === 'c') {
    e.preventDefault();
    if (callbacks.copySelection) callbacks.copySelection();
    return;
  }

  // Paste: Ctrl/Cmd + V
  if (modKey && e.key === 'v') {
    e.preventDefault();
    if (callbacks.pasteSelection) callbacks.pasteSelection();
    return;
  }

  // Delete selected object(s)
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if ((appState.selectedId || appState.selectedIds.length > 0) && callbacks.deleteSelectedObject) {
      e.preventDefault();
      callbacks.deleteSelectedObject();
    }
    return;
  }

  // Escape: deselect and reset tools
  if (e.key === 'Escape') {
    if (callbacks.switchTool) callbacks.switchTool('select');
    return;
  }

  // Tool shortcuts
  if (!modKey) {
    switch (e.key.toLowerCase()) {
      case 'v':
      case 's':
        if (callbacks.switchTool) callbacks.switchTool('select');
        break;
      case 'w':
        if (callbacks.switchTool) callbacks.switchTool('wall');
        break;
      case 'r':
        if (callbacks.switchTool) callbacks.switchTool('rectangle');
        break;
      case 't':
        if (callbacks.switchTool) callbacks.switchTool('text');
        break;
      case 'e':
      case 'x':
        if (callbacks.switchTool) callbacks.switchTool('eraser');
        break;
    }
  }
}

export function handleKeyUp(e) {
  appState.shiftPressed = e.shiftKey;
  appState.ctrlPressed = e.ctrlKey;
  appState.metaPressed = e.metaKey;
}
