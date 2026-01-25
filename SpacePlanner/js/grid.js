// js/grid.js - Grid rendering with LOD

import { GRID_PRIMARY, GRID_SECONDARY, GRID_TERTIARY } from './constants.js';
import { appState } from './state.js';
import { stage, gridLayer } from './konva-setup.js';
import { updateStatusBar } from './utils.js';
import { refreshSelectionUI } from './selection.js';

// Callback for re-rendering after zoom
let renderAllObjectsCallback = null;

export function setGridCallbacks(cb) {
  if (cb.renderAllObjects) renderAllObjectsCallback = cb.renderAllObjects;
}

export function drawGrid() {
  if (!appState.gridVisible) return;
  gridLayer.destroyChildren();

  const scale = stage.scaleX(), pos = stage.position();
  const stageW = stage.width(), stageH = stage.height();

  // LOD: fade out smaller grids as we zoom out
  const showSecondary = scale > 1.5;   // 1 inch lines
  const primaryOpacity = Math.min(1, Math.max(0, (scale - 0.1) / 0.4)); // Fade 1ft between 0.1-0.5 scale

  // 1-inch secondary grid (very zoomed in)
  if (showSecondary) {
    const sX = Math.floor(-pos.x / scale / GRID_SECONDARY) * GRID_SECONDARY;
    const eX = Math.ceil((stageW - pos.x) / scale / GRID_SECONDARY) * GRID_SECONDARY;
    const sY = Math.floor(-pos.y / scale / GRID_SECONDARY) * GRID_SECONDARY;
    const eY = Math.ceil((stageH - pos.y) / scale / GRID_SECONDARY) * GRID_SECONDARY;

    for (let x = sX; x <= eX; x += GRID_SECONDARY) {
      if (x % GRID_PRIMARY !== 0) gridLayer.add(new Konva.Line({ points: [x, sY, x, eY], stroke: '#DED6C7', strokeWidth: 0.5 / scale }));
    }
    for (let y = sY; y <= eY; y += GRID_SECONDARY) {
      if (y % GRID_PRIMARY !== 0) gridLayer.add(new Konva.Line({ points: [sX, y, eX, y], stroke: '#DED6C7', strokeWidth: 0.5 / scale }));
    }
  }

  // 1-foot primary grid (fades out when zoomed out)
  if (primaryOpacity > 0.05) {
    const startX = Math.floor(-pos.x / scale / GRID_PRIMARY) * GRID_PRIMARY;
    const endX = Math.ceil((stageW - pos.x) / scale / GRID_PRIMARY) * GRID_PRIMARY;
    const startY = Math.floor(-pos.y / scale / GRID_PRIMARY) * GRID_PRIMARY;
    const endY = Math.ceil((stageH - pos.y) / scale / GRID_PRIMARY) * GRID_PRIMARY;

    for (let x = startX; x <= endX; x += GRID_PRIMARY) {
      // Skip 10ft lines (drawn separately with higher contrast)
      if (x % GRID_TERTIARY !== 0) {
        gridLayer.add(new Konva.Line({ points: [x, startY, x, endY], stroke: '#B1A796', strokeWidth: 1 / scale, opacity: primaryOpacity }));
      }
    }
    for (let y = startY; y <= endY; y += GRID_PRIMARY) {
      if (y % GRID_TERTIARY !== 0) {
        gridLayer.add(new Konva.Line({ points: [startX, y, endX, y], stroke: '#B1A796', strokeWidth: 1 / scale, opacity: primaryOpacity }));
      }
    }
  }

  // 10-foot grid (always visible, higher contrast)
  const tX = Math.floor(-pos.x / scale / GRID_TERTIARY) * GRID_TERTIARY;
  const tXend = Math.ceil((stageW - pos.x) / scale / GRID_TERTIARY) * GRID_TERTIARY;
  const tY = Math.floor(-pos.y / scale / GRID_TERTIARY) * GRID_TERTIARY;
  const tYend = Math.ceil((stageH - pos.y) / scale / GRID_TERTIARY) * GRID_TERTIARY;

  for (let x = tX; x <= tXend; x += GRID_TERTIARY) {
    gridLayer.add(new Konva.Line({ points: [x, tY, x, tYend], stroke: '#5C6367', strokeWidth: 1.5 / scale }));
  }
  for (let y = tY; y <= tYend; y += GRID_TERTIARY) {
    gridLayer.add(new Konva.Line({ points: [tX, y, tXend, y], stroke: '#5C6367', strokeWidth: 1.5 / scale }));
  }

  gridLayer.batchDraw();
}

export function handleZoom(e) {
  e.evt.preventDefault();
  const oldScale = stage.scaleX(), pointer = stage.getPointerPosition();
  const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
  const dir = e.evt.deltaY > 0 ? -1 : 1;
  let newScale = Math.max(0.1, Math.min(10, dir > 0 ? oldScale * 1.1 : oldScale / 1.1));
  stage.scale({ x: newScale, y: newScale });
  stage.position({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
  stage.batchDraw();
  drawGrid();
  // Re-render for screen-space dimension labels
  if (renderAllObjectsCallback) renderAllObjectsCallback();
  refreshSelectionUI(); // Keep handles/highlights at constant screen size
  updateStatusBar(`Zoom: ${Math.round(newScale * 100)}%`);
}

export function resetView() {
  stage.scale({ x: 1, y: 1 });
  stage.position({ x: 0, y: 0 });
  stage.batchDraw();
  drawGrid();
  if (renderAllObjectsCallback) renderAllObjectsCallback();
  refreshSelectionUI();
  updateStatusBar('View reset to 100%');
}

// Callback for getting state objects
let getObjectsCallback = null;

export function setFitViewCallback(cb) {
  getObjectsCallback = cb;
}

export function fitView() {
  const objects = getObjectsCallback ? getObjectsCallback() : [];

  // If no objects, reset to center at 100%
  if (objects.length === 0) {
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
    drawGrid();
    if (renderAllObjectsCallback) renderAllObjectsCallback();
    refreshSelectionUI();
    updateStatusBar('View reset to 100%');
    return;
  }

  // Calculate bounding box of all objects
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const obj of objects) {
    if (obj.type === 'wall') {
      minX = Math.min(minX, obj.x1, obj.x2);
      minY = Math.min(minY, obj.y1, obj.y2);
      maxX = Math.max(maxX, obj.x1, obj.x2);
      maxY = Math.max(maxY, obj.y1, obj.y2);
    } else if (obj.type === 'rectangle') {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + obj.width);
      maxY = Math.max(maxY, obj.y + obj.height);
    } else if (obj.type === 'text' || obj.type === 'label') {
      minX = Math.min(minX, obj.x);
      minY = Math.min(minY, obj.y);
      maxX = Math.max(maxX, obj.x + 100); // Approximate text width
      maxY = Math.max(maxY, obj.y + 20);  // Approximate text height
    }
  }

  if (minX === Infinity) {
    updateStatusBar('No objects to fit');
    return;
  }

  // Add padding (50px screen space)
  const padding = 50;
  const stageW = stage.width();
  const stageH = stage.height();
  const contentW = maxX - minX;
  const contentH = maxY - minY;

  // Calculate scale to fit content
  const scaleX = (stageW - padding * 2) / contentW;
  const scaleY = (stageH - padding * 2) / contentH;
  let newScale = Math.min(scaleX, scaleY);

  // Clamp scale to reasonable bounds
  newScale = Math.max(0.1, Math.min(10, newScale));

  // Calculate position to center content
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const newX = stageW / 2 - centerX * newScale;
  const newY = stageH / 2 - centerY * newScale;

  stage.scale({ x: newScale, y: newScale });
  stage.position({ x: newX, y: newY });
  stage.batchDraw();
  drawGrid();
  if (renderAllObjectsCallback) renderAllObjectsCallback();
  refreshSelectionUI();
  updateStatusBar(`Fit to content: ${Math.round(newScale * 100)}%`);
}

export function handleResize() {
  const w = window.innerWidth, h = window.innerHeight;
  stage.width(w);
  stage.height(h);
  stage.batchDraw();
  drawGrid();
}
