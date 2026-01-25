# Design Spec: Generic Interior Design Planner

## 1. Project Overview
**Goal:** Create a lightweight, browser-based (HTML/JS) 2D vector drawing tool for room layouts. 
**Target Audience:** Non-technical users who need an intuitive way to visualize floor plans.
**Delivery:** A single-file HTML/CSS/JS solution for zero-setup portability.

---

## 2. Visual Identity & UI
* **Workspace:** White canvas with a dynamic grey grid (primary grid at 12", secondary at 1").
* **Aesthetic:** Clean "blueprint" style with a minimalist floating sidebar.
* **Icons:** Large, labeled buttons for: **Wall**, **Room**, **Furniture**, **Text**, and **Eraser**.



---

## 3. Toolset & Behavior

### A. The "Wall" Tool (Line)
* **Action:** Click-to-start, click-to-end.
* **Intelligence:** * Show a "ghost" line while drawing with live `Ft' In"` dimensions.
    * "Magnetize" (snap) ends to other wall points to ensure closed loops.
    * Snap to a 6-inch grid by default.

### B. The "Room" Tool (Box)
* **Action:** Click and drag to create rectangles.
* **Intelligence:** Automatically calculate and display **Square Footage** in the center of the box.

### C. The "Furniture & Fixtures" Tool (Stamps)
* **Library:** Dropdown menu for:
    * *Architecture:* Door (swing), Window, Stairs.
    * *Furniture:* Bed (King/Queen), Couch, Dining Table, Chair.
* **Interaction:** Drag-and-drop placement with a single "Rotate" handle and "Scale" handles.

---

## 4. Smart Input Logic (The "Natural" Parser)
The app must feature a single "Dimension Entry" box that interprets:
* `10' 6"` -> 126 inches
* `10 6` -> 126 inches
* `150` -> 150 inches
* **Scaling:** Use a ratio of **1 inch = 5 pixels**.

---

## 5. File Management & Sharing
* **Save Format:** Export the canvas state as a `.layout` file (JSON structure).
* **Load Workflow:** "Open" button to upload and parse the `.layout` file back into editable objects.
* **Export Image:** "Save as PNG" button for easy viewing/emailing.

---

## 6. Technical Implementation Requirements
* **Engine:** Use **Konva.js** or **Fabric.js** via CDN for robust canvas object management.
* **State:** Maintain an array of objects: `[{type: 'wall', x1: 0, y1: 0, x2: 120, y2: 0}, ...]`.
* **Undo/Redo:** Implement a basic stack to allow `Ctrl+Z` / `Ctrl+Y`.