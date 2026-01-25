// js/utils.js - Pure utility functions

import { SCALE } from './constants.js';

export const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0;
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
});

// Cross-platform helpers (Mac uses Cmd/Meta, PC uses Ctrl)
export const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
export const isModKey = e => isMac ? e.metaKey : e.ctrlKey;

export const distance = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
export const pixelsToInches = pixels => pixels / SCALE;
export const inchesToPixels = inches => inches * SCALE;

export function parseDimension(input) {
  if (!input) return 0;
  input = input.trim();
  // Match feet and optional inches: 10' 6", 10'6", 10', 10' 6
  let m = input.match(/^(\d+)[''](?:\s*(\d+)[""]?)?$/);
  if (m) return parseInt(m[1]) * 12 + (m[2] ? parseInt(m[2]) : 0);
  // Match space-separated feet inches: 10 6
  m = input.match(/^(\d+)\s+(\d+)$/);
  if (m) return parseInt(m[1]) * 12 + parseInt(m[2]);
  // Match plain number as inches
  m = input.match(/^(\d+)$/);
  return m ? parseInt(m[1]) : 0;
}

export function formatDimension(inches) {
  const feet = Math.floor(inches / 12), rem = Math.round(inches % 12);
  return rem === 0 ? `${feet}'` : `${feet}' ${rem}"`;
}

export const updateStatusBar = text => document.getElementById('status-text').textContent = text;
