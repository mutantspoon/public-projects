// js/tools/wall-tool.js - Wall drawing tool (creation only)
// Editing/handles are managed by selection.js

import { WALL_THICKNESS, HANDLE_RADIUS, HANDLE_STROKE, LABEL_FONT_SIZE } from '../constants.js';
import { appState, state, getActiveLayer } from '../state.js';
import { uiLayer, stage } from '../konva-setup.js';
import { generateUUID, distance, pixelsToInches, formatDimension, updateStatusBar } from '../utils.js';
import { getSnappedPoint, getAxisLock, findNearestVertex } from '../snapping.js';
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

export function setWallToolCallbacks(cb) {
  callbacks = { ...callbacks, ...cb };
}

// Wall drawing state
let wallStart = null;
let ghostLine = null;
let ghostLabel = null;
let startSnapIndicator = null;
let endSnapIndicator = null;

export function handleWallClick(x, y) {
  // Check if active layer is editable
  const activeLayer = getActiveLayer();
  if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
    updateStatusBar(`Cannot draw: layer "${activeLayer?.name || 'unknown'}" is ${activeLayer?.locked ? 'locked' : 'hidden'}`);
    return;
  }

  const axisLock = getAxisLock(wallStart, x, y);
  const snapped = getSnappedPoint(x, y, axisLock);

  if (!wallStart) {
    wallStart = snapped;
    updateStatusBar('Click to finish wall (Shift: axis lock, Ctrl/Cmd: foot grid)');
  } else {
    if (distance(wallStart.x, wallStart.y, snapped.x, snapped.y) > 10) {
      saveSnapshot();
      state.objects.push({
        type: 'wall',
        id: generateUUID(),
        layerId: appState.activeLayerId,
        x1: wallStart.x, y1: wallStart.y,
        x2: snapped.x, y2: snapped.y
      });
      if (callbacks.renderAllObjects) callbacks.renderAllObjects();
      if (callbacks.moveTextToTop) callbacks.moveTextToTop();
    }
    wallStart = snapped;
    updateStatusBar('Wall added. Click to continue or switch tools');
  }
}

export function handleWallMove(x, y) {
  clearWallGhost();

  if (!wallStart) {
    // Show snap indicator if near a vertex
    const nearVertex = findNearestVertex(x, y);
    if (nearVertex) {
      showSnapIndicator(nearVertex.x, nearVertex.y, 'start');
    }
    return;
  }

  const axisLock = getAxisLock(wallStart, x, y);
  const snapped = getSnappedPoint(x, y, axisLock);

  ghostLine = new Konva.Line({
    points: [wallStart.x, wallStart.y, snapped.x, snapped.y],
    stroke: '#528A81',
    strokeWidth: screenSize(WALL_THICKNESS),
    lineCap: 'round',
    opacity: 0.6,
    dash: [screenSize(10), screenSize(5)],
    listening: false
  });
  uiLayer.add(ghostLine);

  const len = distance(wallStart.x, wallStart.y, snapped.x, snapped.y);
  const inches = pixelsToInches(len);
  const midX = (wallStart.x + snapped.x) / 2;
  const midY = (wallStart.y + snapped.y) / 2;
  const angle = Math.atan2(snapped.y - wallStart.y, snapped.x - wallStart.x) * 180 / Math.PI;
  const normAngle = ((angle % 360) + 360) % 360;
  const textRot = (normAngle > 90 && normAngle < 270) ? angle + 180 : angle;
  const fontSize = screenSize(LABEL_FONT_SIZE + 2);
  const labelText = formatDimension(inches);

  ghostLabel = new Konva.Text({
    x: midX, y: midY - screenSize(20),
    text: labelText,
    fontSize: fontSize,
    fill: '#528A81',
    fontStyle: 'bold',
    rotation: textRot,
    offsetX: labelText.length * fontSize * 0.25,
    listening: false
  });
  uiLayer.add(ghostLabel);

  showSnapIndicator(wallStart.x, wallStart.y, 'start');
  showSnapIndicator(snapped.x, snapped.y, 'end');
  uiLayer.batchDraw();
}

function showSnapIndicator(x, y, type) {
  const indicator = new Konva.Circle({
    x, y,
    radius: screenSize(HANDLE_RADIUS - 2),
    fill: '#528A81',
    stroke: '#2D453E',
    strokeWidth: screenSize(HANDLE_STROKE),
    listening: false
  });

  if (type === 'start') {
    if (startSnapIndicator) startSnapIndicator.destroy();
    startSnapIndicator = indicator;
  } else {
    if (endSnapIndicator) endSnapIndicator.destroy();
    endSnapIndicator = indicator;
  }
  uiLayer.add(indicator);
}

export function clearWallGhost() {
  if (ghostLine) { ghostLine.destroy(); ghostLine = null; }
  if (ghostLabel) { ghostLabel.destroy(); ghostLabel = null; }
  if (startSnapIndicator) { startSnapIndicator.destroy(); startSnapIndicator = null; }
  if (endSnapIndicator) { endSnapIndicator.destroy(); endSnapIndicator = null; }
  uiLayer.batchDraw();
}

export function resetWallTool() {
  wallStart = null;
  clearWallGhost();
}

export function getWallStart() {
  return wallStart;
}
