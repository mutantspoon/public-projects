// js/snapping.js - All snapping logic

import { SNAP_GRID, GRID_PRIMARY, SNAP_THRESHOLD, WALL_HIT_WIDTH } from './constants.js';
import { appState, state } from './state.js';
import { distance } from './utils.js';

export const isSnapModifier = () => appState.ctrlPressed || appState.metaPressed;
export const getSnapSize = () => isSnapModifier() ? GRID_PRIMARY : SNAP_GRID;
export const snapToGrid = (value, gridSize) => {
  const gs = gridSize || getSnapSize();
  return Math.round(value / gs) * gs;
};

export function pointOnLine(x1, y1, x2, y2, px, py, threshold = WALL_HIT_WIDTH) {
  const len = distance(x1, y1, x2, y2);
  if (len === 0) return null;
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  if (distance(px, py, cx, cy) > threshold) return null;

  // Snap the point to grid increments along the wall
  const gridSize = getSnapSize();
  if (Math.abs(dx) > Math.abs(dy)) {
    const snappedX = snapToGrid(cx, gridSize);
    const clampedX = Math.max(Math.min(x1, x2), Math.min(Math.max(x1, x2), snappedX));
    const tSnapped = (clampedX - x1) / dx;
    return { x: clampedX, y: y1 + tSnapped * dy };
  } else {
    const snappedY = snapToGrid(cy, gridSize);
    const clampedY = Math.max(Math.min(y1, y2), Math.min(Math.max(y1, y2), snappedY));
    const tSnapped = dy !== 0 ? (clampedY - y1) / dy : 0;
    return { x: x1 + tSnapped * dx, y: clampedY };
  }
}

export function findNearestVertex(x, y) {
  let nearest = null, minDist = SNAP_THRESHOLD;
  state.objects.forEach(obj => {
    if (obj.type === 'wall') {
      const d1 = distance(x, y, obj.x1, obj.y1), d2 = distance(x, y, obj.x2, obj.y2);
      if (d1 < minDist) { minDist = d1; nearest = { x: obj.x1, y: obj.y1 }; }
      if (d2 < minDist) { minDist = d2; nearest = { x: obj.x2, y: obj.y2 }; }
    }
  });
  return nearest;
}

export function findWallAtPoint(x, y) {
  for (let obj of state.objects) {
    if (obj.type === 'wall') {
      const pt = pointOnLine(obj.x1, obj.y1, obj.x2, obj.y2, x, y);
      if (pt) return { wall: obj, point: pt };
    }
  }
  return null;
}

export function findSmartGuides(x, y) {
  const guides = { x: [], y: [] };
  state.objects.forEach(obj => {
    if (obj.type === 'rectangle') {
      guides.x.push(obj.x, obj.x + obj.width, obj.x + obj.width / 2);
      guides.y.push(obj.y, obj.y + obj.height, obj.y + obj.height / 2);
    } else if (obj.type === 'wall') {
      guides.x.push(obj.x1, obj.x2);
      guides.y.push(obj.y1, obj.y2);
    }
  });
  let snapX = null, snapY = null;
  for (const gx of guides.x) {
    if (Math.abs(x - gx) < SNAP_THRESHOLD && (snapX === null || Math.abs(x - gx) < Math.abs(x - snapX))) snapX = gx;
  }
  for (const gy of guides.y) {
    if (Math.abs(y - gy) < SNAP_THRESHOLD && (snapY === null || Math.abs(y - gy) < Math.abs(y - snapY))) snapY = gy;
  }
  return { x: snapX, y: snapY };
}

export function getSnappedPoint(x, y, axisLock = null) {
  if (axisLock) {
    if (axisLock.axis === 'x') x = axisLock.value;
    else if (axisLock.axis === 'y') y = axisLock.value;
  }
  const vertex = findNearestVertex(x, y);
  if (vertex) {
    if (axisLock) {
      if (axisLock.axis === 'x' && Math.abs(vertex.x - axisLock.value) < SNAP_THRESHOLD) return { x: axisLock.value, y: vertex.y };
      if (axisLock.axis === 'y' && Math.abs(vertex.y - axisLock.value) < SNAP_THRESHOLD) return { x: vertex.x, y: axisLock.value };
    } else {
      return vertex;
    }
  }
  const wallSnap = findWallAtPoint(x, y);
  if (wallSnap && !axisLock) return wallSnap.point;
  const guides = findSmartGuides(x, y);
  const snappedX = guides.x !== null ? guides.x : snapToGrid(x);
  const snappedY = guides.y !== null ? guides.y : snapToGrid(y);
  return { x: snappedX, y: snappedY };
}

export function getAxisLock(startPoint, currentX, currentY) {
  if (!appState.shiftPressed || !startPoint) return null;
  const dx = Math.abs(currentX - startPoint.x);
  const dy = Math.abs(currentY - startPoint.y);
  return dx < dy ? { axis: 'x', value: startPoint.x } : { axis: 'y', value: startPoint.y };
}
