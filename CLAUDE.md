# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

**public-projects** contains SpacePlanner, a browser-based interior design tool. This repo is public and hosted on GitHub Pages.

**GitHub Pages URL:** https://mutantspoon.github.io/public-projects/SpacePlanner/

**Directory Structure:**
- `SpacePlanner/` - Browser-based interior design tool

## SpacePlanner

**SpacePlanner** (`SpacePlanner/`) - Browser-based interior design tool
- 2D vector drawing for floor plans and room layouts
- Single-file HTML/CSS/JS application (Konva.js + Tailwind CSS via CDN)
- Tools: walls, rectangles (with stroke/fill colors), text labels, eraser
- Smart snapping: grid (1" or 1'), wall vertices, wall lines, object edges/centers
- Modifiers: Shift for axis lock, Ctrl for coarse (foot) grid snap
- Box selection for multi-object operations
- Natural dimension input (10' 6", 10 6, or plain inches)
- LOD grid system (hides detail at zoom out)
- Undo/redo, save/load (.layout JSON), export PNG
- No server required, runs entirely client-side

### Quick Start

```bash
cd SpacePlanner
# No installation needed - just open in browser
start index.html  # Windows
open index.html   # macOS
```

**Keyboard Shortcuts:**
- `S/W/R/T/E` - Switch tool (Select/Wall/Rectangle/Text/Eraser)
- `Shift` (while drawing) - Lock to horizontal/vertical axis
- `Ctrl` (while drawing) - Snap to foot grid instead of inch grid
- `Space` + drag - Pan canvas
- `Del` - Delete selected object(s)
- `Esc` - Cancel drawing or deselect
- `Ctrl+Z/Y` - Undo/Redo
- Double-click text - Edit text content

**Features:**
- Wall/Rectangle: Click-to-start, click-to-end with live dimensions
- Smart guides: Snap to object edges, centers, and wall vertices
- Text labels: Always render on top, bold styling
- Box select: Click-drag on empty space to select multiple objects
- Dimension parser: Supports `10'`, `10' 6"`, `10 6`, `150` formats
- Color palette: 16 colors for rectangle stroke/fill
- Export: JSON (.layout) and PNG

### Architecture

SpacePlanner uses modular ES6 JavaScript:
- `js/app.js` - Main entry point, initialization
- `js/konva-setup.js` - Canvas and stage setup
- `js/state.js` - Global state management
- `js/tools/` - Tool implementations (wall-tool.js, rectangle-tool.js, text-tool.js)
- `js/snapping.js` - Smart snapping system
- `js/grid.js` - LOD grid rendering
- `js/selection.js` - Multi-object selection
- `js/history.js` - Undo/redo system
- `js/file-io.js` - Save/load functionality
- `bundle.js` - Bundled version (generated via `build.bat`)

### Architectural Patterns

**Single Owner for UI State:**
- Selection module owns ALL selection UI (highlights, handles, previews)
- Prevents cleanup bugs from multiple systems managing overlapping UI

**Creation vs Editing Separation:**
- Tool modules handle CREATION only (ghost shapes while drawing)
- Selection module handles EDITING (drag handles, resize)

**Callback Pattern for Circular Dependencies:**
- ES6 modules can't have circular imports
- Use `setXxxCallbacks()` pattern - each module exposes callback setters
- Init module wires them together during startup

**State Lookups by ID:**
- Always look up objects fresh by ID from state store
- Store only IDs, not object references (prevents stale references)

### Development

```bash
# Build bundled version
cd SpacePlanner
./build.bat  # Windows (uses npx esbuild)
```

## Code Style

**JavaScript:**
- Files: `kebab-case.js`
- Functions: `camelCase()`
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`

**Project Philosophy:**
- Self-contained (no build dependencies, CDN for libraries)
- Settings-driven design (dimension units, grid spacing)
- Minimal features (MVP approach)
- Comments only where logic isn't self-evident

## Platform

**Target:** Cross-platform browser-based tool
- Chrome, Firefox, Edge, Safari
- No OS dependencies, runs entirely client-side
- Single HTML file, portable to any modern browser

## Git Workflow

**Branch:** `main`

**Deployment:**
- GitHub Pages serves from `main` branch
- Push to `main` auto-deploys to https://mutantspoon.github.io/public-projects/SpacePlanner/
