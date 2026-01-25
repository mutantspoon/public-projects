// js/snapping.js - Simplified, zoom-aware snapping
//
// Snapping priority:
// 1. Vertex snap - snap to existing wall endpoints if within threshold
// 2. Grid snap - always snap to grid (1" default, 1' with Ctrl/Cmd)
//
// All thresholds are zoom-aware: they work in screen pixels, not world coords

import { SNAP_GRID, GRID_PRIMARY, SNAP_THRESHOLD } from './constants.js';
import { appState, state } from './state.js';
import { distance } from './utils.js';
import { stage } from './konva-setup.js';

// === GRID SNAPPING ===

// Is modifier key pressed for coarse (foot) grid?
export const isSnapModifier = () => appState.ctrlPressed || appState.metaPressed;

// Get current grid size (inches or feet in pixels)
export const getSnapSize = () => isSnapModifier() ? GRID_PRIMARY : SNAP_GRID;

// Snap a single value to grid
export function snapToGrid(value, gridSize) {
  const gs = gridSize || getSnapSize();
  return Math.round(value / gs) * gs;
}

// Snap a point to grid
export function snapPointToGrid(x, y) {
  const gs = getSnapSize();
  return {
    x: Math.round(x / gs) * gs,
    y: Math.round(y / gs) * gs
  };
}

// === ZOOM-AWARE THRESHOLD ===

// Get threshold in world coordinates that represents SNAP_THRESHOLD screen pixels
// As zoom increases, the world-space threshold decreases
function getWorldThreshold() {
  const scale = stage.scaleX();
  // Clamp scale to reasonable range to avoid extreme values
  const clampedScale = Math.max(0.1, Math.min(10, scale));
  return SNAP_THRESHOLD / clampedScale;
}

// === VERTEX SNAPPING ===

// Find nearest wall vertex within threshold
export function findNearestVertex(x, y) {
  const threshold = getWorldThreshold();
  let nearest = null;
  let minDist = threshold;

  for (const obj of state.objects) {
    if (obj.type === 'wall') {
      const d1 = distance(x, y, obj.x1, obj.y1);
      const d2 = distance(x, y, obj.x2, obj.y2);

      if (d1 < minDist) {
        minDist = d1;
        nearest = { x: obj.x1, y: obj.y1 };
      }
      if (d2 < minDist) {
        minDist = d2;
        nearest = { x: obj.x2, y: obj.y2 };
      }
    }
  }

  return nearest;
}

// === MAIN SNAPPING FUNCTION ===

// Get snapped point with priority: vertex > grid
// axisLock: { axis: 'x'|'y', value: number } for shift-constrained drawing
export function getSnappedPoint(x, y, axisLock = null) {
  // Apply axis lock first (for shift-constrained drawing)
  if (axisLock) {
    if (axisLock.axis === 'x') x = axisLock.value;
    else if (axisLock.axis === 'y') y = axisLock.value;
  }

  // Try vertex snap first
  const vertex = findNearestVertex(x, y);
  if (vertex) {
    // If axis locked, only snap the non-locked axis to the vertex
    if (axisLock) {
      if (axisLock.axis === 'x') {
        return { x: axisLock.value, y: vertex.y };
      } else {
        return { x: vertex.x, y: axisLock.value };
      }
    }
    return vertex;
  }

  // Fall back to grid snap
  return snapPointToGrid(x, y);
}

// === AXIS LOCK (Shift key) ===

// Calculate axis lock based on start point and current position
export function getAxisLock(startPoint, currentX, currentY) {
  if (!appState.shiftPressed || !startPoint) return null;

  const dx = Math.abs(currentX - startPoint.x);
  const dy = Math.abs(currentY - startPoint.y);

  // Lock to the axis with smaller movement (i.e., constrain to the dominant direction)
  return dx < dy
    ? { axis: 'x', value: startPoint.x }
    : { axis: 'y', value: startPoint.y };
}
