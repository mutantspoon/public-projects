// js/tools/rectangle-tool.js - Rectangle drawing tool (creation only)
// Editing/handles are managed by selection.js

import { WALL_THICKNESS, LABEL_FONT_SIZE } from '../constants.js';
import { appState, state, getActiveLayer } from '../state.js';
import { uiLayer, stage } from '../konva-setup.js';
import { generateUUID, pixelsToInches, formatDimension, updateStatusBar } from '../utils.js';
import { getSnappedPoint } from '../snapping.js';
import { saveSnapshot } from '../history.js';

// Helper to get screen-space size (constant visual size regardless of zoom)
function screenSize(pixels) {
  return pixels / stage.scaleX();
}

// Callbacks set by app.js
let callbacks = {
  renderAllObjects: null,
  moveTextToTop: null
};

export function setRectangleToolCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

// Rectangle drawing state
let rectStart = null;
let ghostRect = null;
let ghostDimLabels = { width: null, height: null };

export function handleRectangleClick(x, y) {
  // Check if active layer is editable
  const activeLayer = getActiveLayer();
  if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
    updateStatusBar(`Cannot draw: layer "${activeLayer?.name || 'unknown'}" is ${activeLayer?.locked ? 'locked' : 'hidden'}`);
    return;
  }

  const snapped = getSnappedPoint(x, y);

  if (!rectStart) {
    rectStart = snapped;
    updateStatusBar('Click to set opposite corner');
  } else {
    const minX = Math.min(rectStart.x, snapped.x);
    const minY = Math.min(rectStart.y, snapped.y);
    const maxX = Math.max(rectStart.x, snapped.x);
    const maxY = Math.max(rectStart.y, snapped.y);
    const width = maxX - minX;
    const height = maxY - minY;

    if (width > 5 && height > 5) {
      saveSnapshot();
      state.objects.push({
        type: 'rectangle',
        id: generateUUID(),
        layerId: appState.activeLayerId,
        x: minX, y: minY,
        width, height,
        stroke: appState.rectangleColor,
        strokeWidth: WALL_THICKNESS,
        fill: appState.rectangleFilled ? appState.rectangleColor : ''
      });
      if (callbacks.renderAllObjects) callbacks.renderAllObjects();
      if (callbacks.moveTextToTop) callbacks.moveTextToTop();
      updateStatusBar('Rectangle added');
    }

    rectStart = null;
    clearRectangleGhost();
  }
}

export function handleRectangleMove(x, y) {
  if (!rectStart) return;

  clearRectangleGhost();

  const snapped = getSnappedPoint(x, y);
  const minX = Math.min(rectStart.x, snapped.x);
  const minY = Math.min(rectStart.y, snapped.y);
  const maxX = Math.max(rectStart.x, snapped.x);
  const maxY = Math.max(rectStart.y, snapped.y);
  const width = maxX - minX;
  const height = maxY - minY;

  ghostRect = new Konva.Rect({
    x: minX, y: minY,
    width, height,
    stroke: appState.rectangleColor,
    strokeWidth: screenSize(WALL_THICKNESS),
    fill: appState.rectangleFilled ? appState.rectangleColor : '',
    opacity: 0.6,
    dash: [screenSize(10), screenSize(5)],
    listening: false
  });
  uiLayer.add(ghostRect);

  const widthText = formatDimension(pixelsToInches(width));
  const heightText = formatDimension(pixelsToInches(height));
  const fontSize = screenSize(LABEL_FONT_SIZE);

  ghostDimLabels.width = new Konva.Text({
    x: minX + width / 2,
    y: maxY + screenSize(8),
    text: widthText,
    fontSize: fontSize,
    fill: '#528A81',
    fontStyle: 'bold',
    offsetX: widthText.length * fontSize * 0.25,
    listening: false
  });

  ghostDimLabels.height = new Konva.Text({
    x: maxX + screenSize(15),
    y: minY + height / 2 + heightText.length * fontSize * 0.25,
    text: heightText,
    fontSize: fontSize,
    fill: '#528A81',
    fontStyle: 'bold',
    rotation: -90,
    listening: false
  });

  uiLayer.add(ghostDimLabels.width, ghostDimLabels.height);
  uiLayer.batchDraw();
}

export function clearRectangleGhost() {
  if (ghostRect) { ghostRect.destroy(); ghostRect = null; }
  if (ghostDimLabels.width) { ghostDimLabels.width.destroy(); ghostDimLabels.width = null; }
  if (ghostDimLabels.height) { ghostDimLabels.height.destroy(); ghostDimLabels.height = null; }
  uiLayer.batchDraw();
}

export function resetRectangleTool() {
  rectStart = null;
  clearRectangleGhost();
}

export function getRectStart() {
  return rectStart;
}
