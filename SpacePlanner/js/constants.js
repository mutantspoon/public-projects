// js/constants.js - All constants and configuration

export const SCALE = 5;
export const GRID_PRIMARY = 12 * SCALE;      // 1 foot
export const GRID_SECONDARY = 1 * SCALE;     // 1 inch
export const GRID_TERTIARY = 120 * SCALE;    // 10 feet
export const SNAP_GRID = GRID_SECONDARY;
export const SNAP_THRESHOLD = 15;
export const WALL_THICKNESS = 6;
export const WALL_HIT_WIDTH = 25;

// Screen-space sizes (in pixels, constant regardless of zoom)
export const HANDLE_RADIUS = 8;
export const HANDLE_STROKE = 2;
export const HIGHLIGHT_STROKE = 2;
export const LABEL_FONT_SIZE = 14;

export const COLOR_PALETTE = [
  '#F2F1EF', '#DED6C7', '#B1A796', '#848C8E',
  '#5C6367', '#3A3F42', '#7A8B7C', '#528A81',
  '#2D453E', '#F3C044', '#C88132', '#A65E44',
  '#634B35', '#4A5D66', '#2C3338', '#1D2226'
];
