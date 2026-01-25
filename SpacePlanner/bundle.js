(() => {
  // js/constants.js
  var SCALE = 5;
  var GRID_PRIMARY = 12 * SCALE;
  var GRID_SECONDARY = 1 * SCALE;
  var GRID_TERTIARY = 120 * SCALE;
  var SNAP_GRID = GRID_SECONDARY;
  var SNAP_THRESHOLD = 15;
  var WALL_THICKNESS = 6;
  var WALL_HIT_WIDTH = 25;
  var HANDLE_RADIUS = 8;
  var HANDLE_STROKE = 2;
  var HIGHLIGHT_STROKE = 2;
  var LABEL_FONT_SIZE = 12;
  var COLOR_PALETTE = [
    "#F2F1EF",
    "#DED6C7",
    "#B1A796",
    "#848C8E",
    "#5C6367",
    "#3A3F42",
    "#7A8B7C",
    "#528A81",
    "#2D453E",
    "#F3C044",
    "#C88132",
    "#A65E44",
    "#634B35",
    "#4A5D66",
    "#2C3338",
    "#1D2226"
  ];

  // js/state.js
  var DEFAULT_LAYER_ID = "layer-1";
  var state = {
    version: "1.1",
    scale: SCALE,
    objects: [],
    layers: [
      { id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false, order: 0 }
    ]
  };
  var appState = {
    currentTool: "select",
    selectedId: null,
    selectedIds: [],
    drawingMode: false,
    tempStartPoint: null,
    gridVisible: true,
    dimensionsVisible: true,
    activeLayerId: DEFAULT_LAYER_ID,
    hoveredId: null,
    isPanning: false,
    lastPanPoint: null,
    spacePressed: false,
    shiftPressed: false,
    ctrlPressed: false,
    metaPressed: false,
    isErasing: false,
    erasedIds: /* @__PURE__ */ new Set(),
    middleMouseUsed: false,
    isBoxSelecting: false,
    boxSelectStart: null,
    rectangleColor: "#2C3338",
    rectangleFilled: false
  };
  var history = { undoStack: [], redoStack: [], maxSize: 50 };
  function getLayerById(id) {
    return state.layers.find((l) => l.id === id);
  }
  function getActiveLayer() {
    return getLayerById(appState.activeLayerId);
  }
  function isLayerEditable(layerId) {
    const layer = getLayerById(layerId);
    return layer && layer.visible && !layer.locked;
  }
  function isObjectEditable(obj) {
    if (!obj) return false;
    const layerId = obj.layerId || DEFAULT_LAYER_ID;
    return isLayerEditable(layerId);
  }

  // js/konva-setup.js
  var stage;
  var gridLayer;
  var contentLayer;
  var uiLayer;
  function initializeKonva() {
    const width = window.innerWidth, height = window.innerHeight;
    stage = new Konva.Stage({
      container: "container",
      width,
      height,
      pixelRatio: window.devicePixelRatio || 1
    });
    gridLayer = new Konva.Layer({ listening: false });
    contentLayer = new Konva.Layer();
    uiLayer = new Konva.Layer();
    stage.add(gridLayer, contentLayer, uiLayer);
  }
  function getCanvasPointerPosition() {
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return stage.getAbsoluteTransform().copy().invert().point(pos);
  }

  // js/utils.js
  var generateUUID = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : r & 3 | 8).toString(16);
  });
  var isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  var isModKey = (e) => isMac ? e.metaKey : e.ctrlKey;
  var distance = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  var pixelsToInches = (pixels) => pixels / SCALE;
  var inchesToPixels = (inches) => inches * SCALE;
  function parseDimension(input) {
    if (!input) return 0;
    input = input.trim();
    let m = input.match(/^(\d+)[''](?:\s*(\d+)[""]?)?$/);
    if (m) return parseInt(m[1]) * 12 + (m[2] ? parseInt(m[2]) : 0);
    m = input.match(/^(\d+)\s+(\d+)$/);
    if (m) return parseInt(m[1]) * 12 + parseInt(m[2]);
    m = input.match(/^(\d+)$/);
    return m ? parseInt(m[1]) : 0;
  }
  function formatDimension(inches) {
    const feet = Math.floor(inches / 12), rem = Math.round(inches % 12);
    return rem === 0 ? `${feet}'` : `${feet}' ${rem}"`;
  }
  var updateStatusBar = (text) => document.getElementById("status-text").textContent = text;

  // js/history.js
  var renderAllObjectsCallback = null;
  function setHistoryCallbacks(callbacks8) {
    renderAllObjectsCallback = callbacks8.renderAllObjects;
  }
  function saveSnapshot() {
    history.undoStack.push(JSON.parse(JSON.stringify(state.objects)));
    if (history.undoStack.length > history.maxSize) history.undoStack.shift();
    history.redoStack = [];
    updateUndoRedoButtons();
  }
  function undo() {
    if (history.undoStack.length === 0) return;
    history.redoStack.push(JSON.parse(JSON.stringify(state.objects)));
    state.objects = history.undoStack.pop();
    if (renderAllObjectsCallback) renderAllObjectsCallback();
    updateUndoRedoButtons();
    updateStatusBar("Undo applied");
  }
  function redo() {
    if (history.redoStack.length === 0) return;
    history.undoStack.push(JSON.parse(JSON.stringify(state.objects)));
    state.objects = history.redoStack.pop();
    if (renderAllObjectsCallback) renderAllObjectsCallback();
    updateUndoRedoButtons();
    updateStatusBar("Redo applied");
  }
  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById("undo-btn");
    const redoBtn = document.getElementById("redo-btn");
    if (undoBtn) undoBtn.disabled = history.undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = history.redoStack.length === 0;
  }

  // js/snapping.js
  var isSnapModifier = () => appState.ctrlPressed || appState.metaPressed;
  var getSnapSize = () => isSnapModifier() ? GRID_PRIMARY : SNAP_GRID;
  var snapToGrid = (value, gridSize) => {
    const gs = gridSize || getSnapSize();
    return Math.round(value / gs) * gs;
  };
  function pointOnLine(x1, y1, x2, y2, px, py, threshold = WALL_HIT_WIDTH) {
    const len = distance(x1, y1, x2, y2);
    if (len === 0) return null;
    const dx = x2 - x1, dy = y2 - y1;
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (len * len)));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    if (distance(px, py, cx, cy) > threshold) return null;
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
  function findNearestVertex(x, y) {
    let nearest = null, minDist = SNAP_THRESHOLD;
    state.objects.forEach((obj) => {
      if (obj.type === "wall") {
        const d1 = distance(x, y, obj.x1, obj.y1), d2 = distance(x, y, obj.x2, obj.y2);
        if (d1 < minDist) {
          minDist = d1;
          nearest = { x: obj.x1, y: obj.y1 };
        }
        if (d2 < minDist) {
          minDist = d2;
          nearest = { x: obj.x2, y: obj.y2 };
        }
      }
    });
    return nearest;
  }
  function findWallAtPoint(x, y) {
    for (let obj of state.objects) {
      if (obj.type === "wall") {
        const pt = pointOnLine(obj.x1, obj.y1, obj.x2, obj.y2, x, y);
        if (pt) return { wall: obj, point: pt };
      }
    }
    return null;
  }
  function findSmartGuides(x, y) {
    const guides = { x: [], y: [] };
    state.objects.forEach((obj) => {
      if (obj.type === "rectangle") {
        guides.x.push(obj.x, obj.x + obj.width, obj.x + obj.width / 2);
        guides.y.push(obj.y, obj.y + obj.height, obj.y + obj.height / 2);
      } else if (obj.type === "wall") {
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
  function getSnappedPoint(x, y, axisLock = null) {
    if (axisLock) {
      if (axisLock.axis === "x") x = axisLock.value;
      else if (axisLock.axis === "y") y = axisLock.value;
    }
    const vertex = findNearestVertex(x, y);
    if (vertex) {
      if (axisLock) {
        if (axisLock.axis === "x" && Math.abs(vertex.x - axisLock.value) < SNAP_THRESHOLD) return { x: axisLock.value, y: vertex.y };
        if (axisLock.axis === "y" && Math.abs(vertex.y - axisLock.value) < SNAP_THRESHOLD) return { x: vertex.x, y: axisLock.value };
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
  function getAxisLock(startPoint, currentX, currentY) {
    if (!appState.shiftPressed || !startPoint) return null;
    const dx = Math.abs(currentX - startPoint.x);
    const dy = Math.abs(currentY - startPoint.y);
    return dx < dy ? { axis: "x", value: startPoint.x } : { axis: "y", value: startPoint.y };
  }

  // js/selection.js
  function screenSize(pixels) {
    return pixels / stage.scaleX();
  }
  function getViewportBounds() {
    const scale = stage.scaleX();
    const pos = stage.position();
    return {
      left: -pos.x / scale,
      top: -pos.y / scale,
      right: (stage.width() - pos.x) / scale,
      bottom: (stage.height() - pos.y) / scale
    };
  }
  function isPointVisible(x, y) {
    const vp = getViewportBounds();
    return x >= vp.left && x <= vp.right && y >= vp.top && y <= vp.bottom;
  }
  function clampLabelPosition(x1, y1, x2, y2, midX, midY) {
    if (isPointVisible(midX, midY)) {
      return { x: midX, y: midY };
    }
    const vp = getViewportBounds();
    const margin = screenSize(50);
    let clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, midX));
    let clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, midY));
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 > 0) {
      let t = ((clampedX - x1) * dx + (clampedY - y1) * dy) / len2;
      t = Math.max(0.1, Math.min(0.9, t));
      clampedX = x1 + t * dx;
      clampedY = y1 + t * dy;
      clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, clampedX));
      clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, clampedY));
    }
    return { x: clampedX, y: clampedY };
  }
  var renderAllObjects = null;
  var showRectanglePanel = null;
  var updateRectanglePanelFromSelection = null;
  var updateMoveToLayerButton = null;
  function setSelectionCallbacks(cb) {
    if (cb.renderAllObjects) renderAllObjects = cb.renderAllObjects;
    if (cb.showRectanglePanel) showRectanglePanel = cb.showRectanglePanel;
    if (cb.updateRectanglePanelFromSelection) updateRectanglePanelFromSelection = cb.updateRectanglePanelFromSelection;
    if (cb.updateMoveToLayerButton) updateMoveToLayerButton = cb.updateMoveToLayerButton;
  }
  function selectObject(id) {
    const obj = state.objects.find((o) => o.id === id);
    if (!obj) return;
    if (!isObjectEditable(obj)) {
      updateStatusBar("Cannot select: layer is locked or hidden");
      return;
    }
    if (appState.selectedId && appState.selectedId !== id) {
      deselectObject();
    }
    appState.selectedId = id;
    drawSelectionHighlight(obj);
    createHandles(obj);
    if (obj.type === "rectangle") {
      if (showRectanglePanel) showRectanglePanel(true);
      if (updateRectanglePanelFromSelection) updateRectanglePanelFromSelection(obj);
    }
    if (updateMoveToLayerButton) updateMoveToLayerButton();
    updateStatusBar(`Selected: ${obj.type}`);
  }
  function deselectObject() {
    clearAllHighlights();
    clearAllHandles();
    clearAllPreviews();
    clearMultiSelectGroup();
    if (showRectanglePanel) showRectanglePanel(false);
    appState.selectedId = null;
    appState.selectedIds = [];
    if (updateMoveToLayerButton) updateMoveToLayerButton();
    uiLayer.batchDraw();
    contentLayer.batchDraw();
  }
  function selectObjects(ids) {
    if (ids.length === 0) return;
    if (ids.length === 1) {
      selectObject(ids[0]);
      return;
    }
    deselectObject();
    const editableIds = ids.filter((id) => {
      const obj = state.objects.find((o) => o.id === id);
      return obj && isObjectEditable(obj);
    });
    if (editableIds.length === 0) return;
    if (editableIds.length === 1) {
      selectObject(editableIds[0]);
      return;
    }
    appState.selectedIds = editableIds;
    appState.selectedId = null;
    const objects = editableIds.map((id) => state.objects.find((o) => o.id === id)).filter(Boolean);
    drawMultiSelectionHighlights(objects);
    createMultiSelectDragGroup(objects);
    if (updateMoveToLayerButton) updateMoveToLayerButton();
    updateStatusBar(`Selected ${editableIds.length} objects (drag to move)`);
  }
  var highlights = [];
  function createHighlightForObject(obj) {
    const ss = screenSize;
    const pad = ss(4);
    const stroke = ss(HIGHLIGHT_STROKE);
    const dash = [ss(6), ss(4)];
    let highlight = null;
    if (obj.type === "wall") {
      const minX = Math.min(obj.x1, obj.x2);
      const minY = Math.min(obj.y1, obj.y2);
      const maxX = Math.max(obj.x1, obj.x2);
      const maxY = Math.max(obj.y1, obj.y2);
      highlight = new Konva.Rect({
        x: minX - pad,
        y: minY - pad,
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
        stroke: "#528A81",
        strokeWidth: stroke,
        dash,
        opacity: 0.9,
        listening: false,
        name: "highlight-" + obj.id
      });
    } else if (obj.type === "rectangle") {
      highlight = new Konva.Rect({
        x: obj.x - pad,
        y: obj.y - pad,
        width: obj.width + pad * 2,
        height: obj.height + pad * 2,
        stroke: "#528A81",
        strokeWidth: stroke,
        dash,
        opacity: 0.9,
        listening: false,
        name: "highlight-" + obj.id
      });
    } else if (obj.type === "text" || obj.type === "label") {
      const shape = contentLayer.findOne("#" + obj.id);
      const width = shape ? shape.width() : 50;
      const height = shape ? shape.height() : 20;
      highlight = new Konva.Rect({
        x: obj.x - pad,
        y: obj.y - pad,
        width: width + pad * 2,
        height: height + pad * 2,
        stroke: "#528A81",
        strokeWidth: stroke,
        dash,
        opacity: 0.9,
        listening: false,
        name: "highlight-" + obj.id
      });
    }
    return highlight;
  }
  function drawSelectionHighlight(obj) {
    clearAllHighlights();
    const highlight = createHighlightForObject(obj);
    if (highlight) {
      highlights.push(highlight);
      uiLayer.add(highlight);
      uiLayer.batchDraw();
    }
  }
  function drawMultiSelectionHighlights(objects) {
    clearAllHighlights();
    for (const obj of objects) {
      const highlight = createHighlightForObject(obj);
      if (highlight) {
        highlights.push(highlight);
        uiLayer.add(highlight);
      }
    }
    uiLayer.batchDraw();
  }
  function clearAllHighlights() {
    highlights.forEach((h) => h.destroy());
    highlights = [];
  }
  function refreshSelectionUI() {
    if (appState.selectedIds.length > 0) {
      const objects = appState.selectedIds.map((id) => state.objects.find((o) => o.id === id)).filter(Boolean);
      if (objects.length > 1) {
        drawMultiSelectionHighlights(objects);
        createMultiSelectDragGroup(objects);
      } else if (objects.length === 1) {
        drawSelectionHighlight(objects[0]);
        createHandles(objects[0]);
      }
      return;
    }
    if (!appState.selectedId) return;
    const obj = state.objects.find((o) => o.id === appState.selectedId);
    if (obj) {
      drawSelectionHighlight(obj);
      createHandles(obj);
    }
  }
  var handles = [];
  var currentObjectId = null;
  function createHandles(obj) {
    clearAllHandles();
    currentObjectId = obj.id;
    if (obj.type === "wall") {
      createWallHandles(obj);
    } else if (obj.type === "rectangle") {
      createRectangleHandles(obj);
    }
    uiLayer.batchDraw();
  }
  function clearAllHandles() {
    handles.forEach((h) => h.destroy());
    handles = [];
    currentObjectId = null;
  }
  function createWallHandles(wallObj) {
    [1, 2].forEach((i) => {
      const handle = new Konva.Circle({
        x: i === 1 ? wallObj.x1 : wallObj.x2,
        y: i === 1 ? wallObj.y1 : wallObj.y2,
        radius: screenSize(HANDLE_RADIUS + 2),
        fill: "#528A81",
        stroke: "#2D453E",
        strokeWidth: screenSize(HANDLE_STROKE),
        draggable: true,
        name: "handle"
      });
      handle.on("dragmove", () => {
        clearAllHighlights();
        const snapped = getSnappedPoint(handle.x(), handle.y());
        handle.position(snapped);
        const current = state.objects.find((o) => o.id === currentObjectId);
        if (current) updateWallPreview(current, i, snapped);
      });
      handle.on("dragend", () => {
        const current = state.objects.find((o) => o.id === currentObjectId);
        if (!current) return;
        saveSnapshot();
        if (i === 1) {
          current.x1 = handle.x();
          current.y1 = handle.y();
        } else {
          current.x2 = handle.x();
          current.y2 = handle.y();
        }
        clearAllPreviews();
        if (renderAllObjects) renderAllObjects();
        const updated = state.objects.find((o) => o.id === currentObjectId);
        if (updated) {
          drawSelectionHighlight(updated);
          createHandles(updated);
        }
      });
      uiLayer.add(handle);
      handles.push(handle);
    });
  }
  var RECT_HANDLE_POSITIONS = [
    { name: "top-left", getX: (r) => r.x, getY: (r) => r.y },
    { name: "top-center", getX: (r) => r.x + r.width / 2, getY: (r) => r.y },
    { name: "top-right", getX: (r) => r.x + r.width, getY: (r) => r.y },
    { name: "middle-left", getX: (r) => r.x, getY: (r) => r.y + r.height / 2 },
    { name: "middle-right", getX: (r) => r.x + r.width, getY: (r) => r.y + r.height / 2 },
    { name: "bottom-left", getX: (r) => r.x, getY: (r) => r.y + r.height },
    { name: "bottom-center", getX: (r) => r.x + r.width / 2, getY: (r) => r.y + r.height },
    { name: "bottom-right", getX: (r) => r.x + r.width, getY: (r) => r.y + r.height }
  ];
  function createRectangleHandles(rectObj) {
    RECT_HANDLE_POSITIONS.forEach((pos) => {
      const handle = new Konva.Circle({
        x: pos.getX(rectObj),
        y: pos.getY(rectObj),
        radius: screenSize(HANDLE_RADIUS),
        fill: "#528A81",
        stroke: "#2D453E",
        strokeWidth: screenSize(HANDLE_STROKE),
        draggable: true,
        name: "handle"
      });
      handle.on("dragmove", () => {
        clearAllHighlights();
        const snapped = getSnappedPoint(handle.x(), handle.y());
        handle.position(snapped);
        const current = state.objects.find((o) => o.id === currentObjectId);
        if (current) updateRectanglePreview(current, pos.name, snapped);
      });
      handle.on("dragend", () => {
        const current = state.objects.find((o) => o.id === currentObjectId);
        if (!current) return;
        saveSnapshot();
        const newBounds = calculateRectBounds(current, pos.name, handle.x(), handle.y());
        current.x = newBounds.x;
        current.y = newBounds.y;
        current.width = newBounds.width;
        current.height = newBounds.height;
        clearAllPreviews();
        if (renderAllObjects) renderAllObjects();
        const updated = state.objects.find((o) => o.id === currentObjectId);
        if (updated) {
          drawSelectionHighlight(updated);
          createHandles(updated);
        }
      });
      uiLayer.add(handle);
      handles.push(handle);
    });
  }
  function calculateRectBounds(rect, handleName, newX, newY) {
    let x = rect.x, y = rect.y, width = rect.width, height = rect.height;
    switch (handleName) {
      case "top-left":
        width = rect.x + rect.width - newX;
        height = rect.y + rect.height - newY;
        x = newX;
        y = newY;
        break;
      case "top-center":
        height = rect.y + rect.height - newY;
        y = newY;
        break;
      case "top-right":
        width = newX - rect.x;
        height = rect.y + rect.height - newY;
        y = newY;
        break;
      case "middle-left":
        width = rect.x + rect.width - newX;
        x = newX;
        break;
      case "middle-right":
        width = newX - rect.x;
        break;
      case "bottom-left":
        width = rect.x + rect.width - newX;
        height = newY - rect.y;
        x = newX;
        break;
      case "bottom-center":
        height = newY - rect.y;
        break;
      case "bottom-right":
        width = newX - rect.x;
        height = newY - rect.y;
        break;
    }
    if (width < 10) width = 10;
    if (height < 10) height = 10;
    return { x, y, width, height };
  }
  var multiSelectGroup = null;
  var multiSelectStartPositions = [];
  function getMultiSelectBounds(objects) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const obj of objects) {
      if (obj.type === "wall") {
        minX = Math.min(minX, obj.x1, obj.x2);
        minY = Math.min(minY, obj.y1, obj.y2);
        maxX = Math.max(maxX, obj.x1, obj.x2);
        maxY = Math.max(maxY, obj.y1, obj.y2);
      } else if (obj.type === "rectangle") {
        minX = Math.min(minX, obj.x);
        minY = Math.min(minY, obj.y);
        maxX = Math.max(maxX, obj.x + obj.width);
        maxY = Math.max(maxY, obj.y + obj.height);
      } else if (obj.type === "text" || obj.type === "label") {
        minX = Math.min(minX, obj.x);
        minY = Math.min(minY, obj.y);
        maxX = Math.max(maxX, obj.x + 100);
        maxY = Math.max(maxY, obj.y + 20);
      }
    }
    const pad = screenSize(10);
    return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }
  function createMultiSelectDragGroup(objects) {
    clearMultiSelectGroup();
    const bounds = getMultiSelectBounds(objects);
    multiSelectStartPositions = objects.map((obj) => {
      if (obj.type === "wall") {
        return { id: obj.id, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
      } else {
        return { id: obj.id, x: obj.x, y: obj.y };
      }
    });
    multiSelectGroup = new Konva.Rect({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fill: "transparent",
      stroke: "#528A81",
      strokeWidth: screenSize(1),
      dash: [screenSize(8), screenSize(4)],
      draggable: true,
      name: "multi-select-group"
    });
    const startX = bounds.x;
    const startY = bounds.y;
    multiSelectGroup.on("dragmove", () => {
      const dx = multiSelectGroup.x() - startX;
      const dy = multiSelectGroup.y() - startY;
      for (const startPos of multiSelectStartPositions) {
        const obj = state.objects.find((o) => o.id === startPos.id);
        if (!obj) continue;
        if (obj.type === "wall") {
          obj.x1 = startPos.x1 + dx;
          obj.y1 = startPos.y1 + dy;
          obj.x2 = startPos.x2 + dx;
          obj.y2 = startPos.y2 + dy;
        } else {
          obj.x = startPos.x + dx;
          obj.y = startPos.y + dy;
        }
      }
      const currentObjects = appState.selectedIds.map((id) => state.objects.find((o) => o.id === id)).filter(Boolean);
      drawMultiSelectionHighlights(currentObjects);
      if (renderAllObjects) renderAllObjects();
    });
    multiSelectGroup.on("dragend", () => {
      saveSnapshot();
      const dx = multiSelectGroup.x() - startX;
      const dy = multiSelectGroup.y() - startY;
      const snapped = getSnappedPoint(startX + dx, startY + dy);
      const snapDx = snapped.x - startX;
      const snapDy = snapped.y - startY;
      for (const startPos of multiSelectStartPositions) {
        const obj = state.objects.find((o) => o.id === startPos.id);
        if (!obj) continue;
        if (obj.type === "wall") {
          obj.x1 = startPos.x1 + snapDx;
          obj.y1 = startPos.y1 + snapDy;
          obj.x2 = startPos.x2 + snapDx;
          obj.y2 = startPos.y2 + snapDy;
        } else {
          obj.x = startPos.x + snapDx;
          obj.y = startPos.y + snapDy;
        }
      }
      if (renderAllObjects) renderAllObjects();
      const currentObjects = appState.selectedIds.map((id) => state.objects.find((o) => o.id === id)).filter(Boolean);
      drawMultiSelectionHighlights(currentObjects);
      createMultiSelectDragGroup(currentObjects);
    });
    uiLayer.add(multiSelectGroup);
    uiLayer.batchDraw();
  }
  function clearMultiSelectGroup() {
    if (multiSelectGroup) {
      multiSelectGroup.destroy();
      multiSelectGroup = null;
    }
    multiSelectStartPositions = [];
  }
  var previewShape = null;
  var previewLabel = null;
  var previewLabel2 = null;
  function updateWallPreview(wallObj, endpointIndex, newPos) {
    clearAllPreviews();
    const x1 = endpointIndex === 1 ? newPos.x : wallObj.x1;
    const y1 = endpointIndex === 1 ? newPos.y : wallObj.y1;
    const x2 = endpointIndex === 2 ? newPos.x : wallObj.x2;
    const y2 = endpointIndex === 2 ? newPos.y : wallObj.y2;
    previewShape = new Konva.Line({
      points: [x1, y1, x2, y2],
      stroke: "#528A81",
      strokeWidth: screenSize(WALL_THICKNESS),
      lineCap: "round",
      opacity: 0.7,
      listening: false
    });
    uiLayer.add(previewShape);
    const len = distance(x1, y1, x2, y2);
    const inches = pixelsToInches(len);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    const normAngle = (angle % 360 + 360) % 360;
    const textRot = normAngle > 90 && normAngle < 270 ? angle + 180 : angle;
    const fontSize = screenSize(LABEL_FONT_SIZE + 2);
    const labelText = formatDimension(inches);
    const labelPos = clampLabelPosition(x1, y1, x2, y2, midX, midY);
    previewLabel = new Konva.Text({
      x: labelPos.x,
      y: labelPos.y - screenSize(20),
      text: labelText,
      fontSize,
      fill: "#528A81",
      fontStyle: "bold",
      rotation: textRot,
      offsetX: labelText.length * fontSize * 0.25,
      listening: false
    });
    uiLayer.add(previewLabel);
    uiLayer.batchDraw();
  }
  function updateRectanglePreview(rectObj, handleName, newPos) {
    clearAllPreviews();
    const newBounds = calculateRectBounds(rectObj, handleName, newPos.x, newPos.y);
    const fontSize = screenSize(LABEL_FONT_SIZE + 2);
    previewShape = new Konva.Rect({
      x: newBounds.x,
      y: newBounds.y,
      width: newBounds.width,
      height: newBounds.height,
      stroke: "#528A81",
      strokeWidth: screenSize(WALL_THICKNESS),
      fill: rectObj.fill || "",
      opacity: 0.7,
      listening: false
    });
    uiLayer.add(previewShape);
    const widthText = formatDimension(pixelsToInches(newBounds.width));
    const heightText = formatDimension(pixelsToInches(newBounds.height));
    previewLabel = new Konva.Text({
      x: newBounds.x + newBounds.width / 2,
      y: newBounds.y + newBounds.height + screenSize(8),
      text: widthText,
      fontSize,
      fill: "#528A81",
      fontStyle: "bold",
      offsetX: widthText.length * fontSize * 0.25,
      listening: false
    });
    previewLabel2 = new Konva.Text({
      x: newBounds.x + newBounds.width + screenSize(15),
      y: newBounds.y + newBounds.height / 2 + heightText.length * fontSize * 0.25,
      text: heightText,
      fontSize,
      fill: "#528A81",
      fontStyle: "bold",
      rotation: -90,
      listening: false
    });
    uiLayer.add(previewLabel, previewLabel2);
    uiLayer.batchDraw();
  }
  function clearAllPreviews() {
    if (previewShape) {
      previewShape.destroy();
      previewShape = null;
    }
    if (previewLabel) {
      previewLabel.destroy();
      previewLabel = null;
    }
    if (previewLabel2) {
      previewLabel2.destroy();
      previewLabel2 = null;
    }
  }
  function deleteSelectedObject() {
    if (appState.selectedIds.length > 0) {
      saveSnapshot();
      const count = appState.selectedIds.length;
      for (const id of appState.selectedIds) {
        const idx2 = state.objects.findIndex((o) => o.id === id);
        if (idx2 !== -1) state.objects.splice(idx2, 1);
      }
      deselectObject();
      if (renderAllObjects) renderAllObjects();
      updateStatusBar(`Deleted ${count} objects`);
      return;
    }
    if (!appState.selectedId) return;
    saveSnapshot();
    const idx = state.objects.findIndex((o) => o.id === appState.selectedId);
    if (idx !== -1) {
      state.objects.splice(idx, 1);
      deselectObject();
      if (renderAllObjects) renderAllObjects();
      updateStatusBar("Object deleted");
    }
  }
  function deleteObjectById(id) {
    saveSnapshot();
    const idx = state.objects.findIndex((o) => o.id === id);
    if (idx !== -1) {
      if (appState.selectedId === id) deselectObject();
      state.objects.splice(idx, 1);
      if (renderAllObjects) renderAllObjects();
      updateStatusBar("Object deleted");
    }
  }
  var boxSelectStart = null;
  var boxSelectRect = null;
  function startBoxSelect(x, y) {
    boxSelectStart = { x, y };
    boxSelectRect = new Konva.Rect({
      x,
      y,
      width: 0,
      height: 0,
      stroke: "#528A81",
      strokeWidth: screenSize(1),
      dash: [screenSize(4), screenSize(4)],
      fill: "rgba(82, 138, 129, 0.1)",
      listening: false
    });
    uiLayer.add(boxSelectRect);
    uiLayer.batchDraw();
  }
  function updateBoxSelect(x, y) {
    if (!boxSelectStart || !boxSelectRect) return;
    const minX = Math.min(boxSelectStart.x, x);
    const minY = Math.min(boxSelectStart.y, y);
    const maxX = Math.max(boxSelectStart.x, x);
    const maxY = Math.max(boxSelectStart.y, y);
    boxSelectRect.x(minX);
    boxSelectRect.y(minY);
    boxSelectRect.width(maxX - minX);
    boxSelectRect.height(maxY - minY);
    uiLayer.batchDraw();
  }
  function endBoxSelect(x, y) {
    if (!boxSelectStart || !boxSelectRect) return;
    const minX = Math.min(boxSelectStart.x, x);
    const minY = Math.min(boxSelectStart.y, y);
    const maxX = Math.max(boxSelectStart.x, x);
    const maxY = Math.max(boxSelectStart.y, y);
    const selectedObjects = state.objects.filter((obj) => {
      if (!isObjectEditable(obj)) return false;
      if (obj.type === "wall") {
        const p1In = obj.x1 >= minX && obj.x1 <= maxX && obj.y1 >= minY && obj.y1 <= maxY;
        const p2In = obj.x2 >= minX && obj.x2 <= maxX && obj.y2 >= minY && obj.y2 <= maxY;
        return p1In || p2In;
      } else if (obj.type === "rectangle") {
        return !(obj.x > maxX || obj.x + obj.width < minX || obj.y > maxY || obj.y + obj.height < minY);
      } else if (obj.type === "text" || obj.type === "label") {
        return obj.x >= minX && obj.x <= maxX && obj.y >= minY && obj.y <= maxY;
      }
      return false;
    });
    boxSelectRect.destroy();
    boxSelectRect = null;
    boxSelectStart = null;
    uiLayer.batchDraw();
    if (selectedObjects.length > 0) {
      selectObjects(selectedObjects.map((o) => o.id));
    }
    return selectedObjects;
  }
  function cancelBoxSelect() {
    if (boxSelectRect) {
      boxSelectRect.destroy();
      boxSelectRect = null;
    }
    boxSelectStart = null;
    uiLayer.batchDraw();
  }
  function isBoxSelecting() {
    return boxSelectStart !== null;
  }
  var clipboard = [];
  var PASTE_OFFSET = 20;
  function copySelection() {
    const objectsToCopy = [];
    if (appState.selectedIds.length > 0) {
      for (const id of appState.selectedIds) {
        const obj = state.objects.find((o) => o.id === id);
        if (obj) objectsToCopy.push(obj);
      }
    } else if (appState.selectedId) {
      const obj = state.objects.find((o) => o.id === appState.selectedId);
      if (obj) objectsToCopy.push(obj);
    }
    if (objectsToCopy.length === 0) {
      updateStatusBar("Nothing to copy");
      return;
    }
    clipboard = objectsToCopy.map((obj) => JSON.parse(JSON.stringify(obj)));
    updateStatusBar(`Copied ${clipboard.length} object${clipboard.length > 1 ? "s" : ""}`);
  }
  function pasteSelection() {
    if (clipboard.length === 0) {
      updateStatusBar("Nothing to paste");
      return;
    }
    saveSnapshot();
    const newIds = [];
    const offset = screenSize(PASTE_OFFSET);
    for (const template of clipboard) {
      const newObj = JSON.parse(JSON.stringify(template));
      newObj.id = generateUUID();
      newObj.layerId = appState.activeLayerId;
      if (newObj.type === "wall") {
        newObj.x1 += offset;
        newObj.y1 += offset;
        newObj.x2 += offset;
        newObj.y2 += offset;
      } else {
        newObj.x += offset;
        newObj.y += offset;
      }
      state.objects.push(newObj);
      newIds.push(newObj.id);
    }
    if (renderAllObjects) renderAllObjects();
    selectObjects(newIds);
    updateStatusBar(`Pasted ${newIds.length} object${newIds.length > 1 ? "s" : ""}`);
  }

  // js/grid.js
  var renderAllObjectsCallback2 = null;
  function setGridCallbacks(cb) {
    if (cb.renderAllObjects) renderAllObjectsCallback2 = cb.renderAllObjects;
  }
  function drawGrid() {
    if (!appState.gridVisible) return;
    gridLayer.destroyChildren();
    const scale = stage.scaleX(), pos = stage.position();
    const stageW = stage.width(), stageH = stage.height();
    const showSecondary = scale > 1.5;
    const primaryOpacity = Math.min(1, Math.max(0, (scale - 0.1) / 0.4));
    if (showSecondary) {
      const sX = Math.floor(-pos.x / scale / GRID_SECONDARY) * GRID_SECONDARY;
      const eX = Math.ceil((stageW - pos.x) / scale / GRID_SECONDARY) * GRID_SECONDARY;
      const sY = Math.floor(-pos.y / scale / GRID_SECONDARY) * GRID_SECONDARY;
      const eY = Math.ceil((stageH - pos.y) / scale / GRID_SECONDARY) * GRID_SECONDARY;
      for (let x = sX; x <= eX; x += GRID_SECONDARY) {
        if (x % GRID_PRIMARY !== 0) gridLayer.add(new Konva.Line({ points: [x, sY, x, eY], stroke: "#DED6C7", strokeWidth: 0.5 / scale }));
      }
      for (let y = sY; y <= eY; y += GRID_SECONDARY) {
        if (y % GRID_PRIMARY !== 0) gridLayer.add(new Konva.Line({ points: [sX, y, eX, y], stroke: "#DED6C7", strokeWidth: 0.5 / scale }));
      }
    }
    if (primaryOpacity > 0.05) {
      const startX = Math.floor(-pos.x / scale / GRID_PRIMARY) * GRID_PRIMARY;
      const endX = Math.ceil((stageW - pos.x) / scale / GRID_PRIMARY) * GRID_PRIMARY;
      const startY = Math.floor(-pos.y / scale / GRID_PRIMARY) * GRID_PRIMARY;
      const endY = Math.ceil((stageH - pos.y) / scale / GRID_PRIMARY) * GRID_PRIMARY;
      for (let x = startX; x <= endX; x += GRID_PRIMARY) {
        if (x % GRID_TERTIARY !== 0) {
          gridLayer.add(new Konva.Line({ points: [x, startY, x, endY], stroke: "#B1A796", strokeWidth: 1 / scale, opacity: primaryOpacity }));
        }
      }
      for (let y = startY; y <= endY; y += GRID_PRIMARY) {
        if (y % GRID_TERTIARY !== 0) {
          gridLayer.add(new Konva.Line({ points: [startX, y, endX, y], stroke: "#B1A796", strokeWidth: 1 / scale, opacity: primaryOpacity }));
        }
      }
    }
    const tX = Math.floor(-pos.x / scale / GRID_TERTIARY) * GRID_TERTIARY;
    const tXend = Math.ceil((stageW - pos.x) / scale / GRID_TERTIARY) * GRID_TERTIARY;
    const tY = Math.floor(-pos.y / scale / GRID_TERTIARY) * GRID_TERTIARY;
    const tYend = Math.ceil((stageH - pos.y) / scale / GRID_TERTIARY) * GRID_TERTIARY;
    for (let x = tX; x <= tXend; x += GRID_TERTIARY) {
      gridLayer.add(new Konva.Line({ points: [x, tY, x, tYend], stroke: "#5C6367", strokeWidth: 1.5 / scale }));
    }
    for (let y = tY; y <= tYend; y += GRID_TERTIARY) {
      gridLayer.add(new Konva.Line({ points: [tX, y, tXend, y], stroke: "#5C6367", strokeWidth: 1.5 / scale }));
    }
    gridLayer.batchDraw();
  }
  function handleZoom(e) {
    e.evt.preventDefault();
    const oldScale = stage.scaleX(), pointer = stage.getPointerPosition();
    const mousePointTo = { x: (pointer.x - stage.x()) / oldScale, y: (pointer.y - stage.y()) / oldScale };
    const dir = e.evt.deltaY > 0 ? -1 : 1;
    let newScale = Math.max(0.1, Math.min(10, dir > 0 ? oldScale * 1.1 : oldScale / 1.1));
    stage.scale({ x: newScale, y: newScale });
    stage.position({ x: pointer.x - mousePointTo.x * newScale, y: pointer.y - mousePointTo.y * newScale });
    stage.batchDraw();
    drawGrid();
    if (renderAllObjectsCallback2) renderAllObjectsCallback2();
    refreshSelectionUI();
    updateStatusBar(`Zoom: ${Math.round(newScale * 100)}%`);
  }
  function resetView() {
    stage.scale({ x: 1, y: 1 });
    stage.position({ x: 0, y: 0 });
    stage.batchDraw();
    drawGrid();
    updateStatusBar("View reset to 100%");
  }
  function handleResize() {
    const w = window.innerWidth, h = window.innerHeight;
    stage.width(w);
    stage.height(h);
    stage.batchDraw();
    drawGrid();
  }

  // js/rendering.js
  function screenSize2(pixels) {
    return pixels / stage.scaleX();
  }
  function getViewportBounds2() {
    const scale = stage.scaleX();
    const pos = stage.position();
    return {
      left: -pos.x / scale,
      top: -pos.y / scale,
      right: (stage.width() - pos.x) / scale,
      bottom: (stage.height() - pos.y) / scale
    };
  }
  function isPointVisible2(x, y, margin = 0) {
    const vp = getViewportBounds2();
    return x >= vp.left - margin && x <= vp.right + margin && y >= vp.top - margin && y <= vp.bottom + margin;
  }
  function clampLabelPosition2(x1, y1, x2, y2, midX, midY) {
    if (isPointVisible2(midX, midY)) {
      return { x: midX, y: midY };
    }
    const vp = getViewportBounds2();
    const margin = screenSize2(50);
    let clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, midX));
    let clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, midY));
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    if (len2 > 0) {
      let t = ((clampedX - x1) * dx + (clampedY - y1) * dy) / len2;
      t = Math.max(0.1, Math.min(0.9, t));
      clampedX = x1 + t * dx;
      clampedY = y1 + t * dy;
      clampedX = Math.max(vp.left + margin, Math.min(vp.right - margin, clampedX));
      clampedY = Math.max(vp.top + margin, Math.min(vp.bottom - margin, clampedY));
    }
    return { x: clampedX, y: clampedY };
  }
  var callbacks = {
    onDelete: null,
    onSelect: null,
    onWallClick: null,
    onRectClick: null,
    onTextClick: null,
    onTextEdit: null,
    getCursorForTool: null,
    updateStatusBar: null
  };
  function setRenderingCallbacks(cb) {
    callbacks = { ...callbacks, ...cb };
  }
  function moveTextToTop() {
    state.objects.filter((obj) => obj.type === "text" || obj.type === "label").forEach((obj) => {
      const shape = contentLayer.findOne("#" + obj.id);
      if (shape) shape.moveToTop();
    });
    contentLayer.batchDraw();
  }
  function renderAllObjects2() {
    contentLayer.destroyChildren();
    const visibleObjects = state.objects.filter((obj) => {
      const layer = getLayerById(obj.layerId || DEFAULT_LAYER_ID);
      return layer && layer.visible;
    });
    visibleObjects.sort((a, b) => {
      const layerA = getLayerById(a.layerId || DEFAULT_LAYER_ID);
      const layerB = getLayerById(b.layerId || DEFAULT_LAYER_ID);
      return (layerA?.order || 0) - (layerB?.order || 0);
    });
    const textObjects = [], otherObjects = [];
    for (const obj of visibleObjects) {
      (obj.type === "text" || obj.type === "label" ? textObjects : otherObjects).push(obj);
    }
    otherObjects.forEach((obj) => renderObject(obj));
    textObjects.forEach((obj) => renderObject(obj));
    contentLayer.batchDraw();
  }
  function renderObject(obj) {
    let shape;
    if (obj.type === "wall") {
      const group = new Konva.Group({ id: obj.id, name: "wall-group" });
      const line = new Konva.Line({
        points: [obj.x1, obj.y1, obj.x2, obj.y2],
        stroke: "#2C3338",
        strokeWidth: screenSize2(WALL_THICKNESS),
        lineCap: "round",
        lineJoin: "round",
        hitStrokeWidth: screenSize2(WALL_HIT_WIDTH)
      });
      const len = distance(obj.x1, obj.y1, obj.x2, obj.y2);
      const inches = pixelsToInches(len);
      const midX = (obj.x1 + obj.x2) / 2, midY = (obj.y1 + obj.y2) / 2;
      const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1) * 180 / Math.PI;
      const normAngle = (angle % 360 + 360) % 360;
      const textRot = normAngle > 90 && normAngle < 270 ? angle + 180 : angle;
      group.add(line);
      if (appState.dimensionsVisible) {
        const fontSize = screenSize2(LABEL_FONT_SIZE);
        const labelText = formatDimension(inches);
        const labelPos = clampLabelPosition2(obj.x1, obj.y1, obj.x2, obj.y2, midX, midY);
        const dimLabel = new Konva.Text({
          x: labelPos.x,
          y: labelPos.y - screenSize2(15),
          text: labelText,
          fontSize,
          fill: "#5C6367",
          fontStyle: "bold",
          rotation: textRot,
          offsetX: labelText.length * fontSize * 0.25,
          listening: false,
          name: "wall-label-" + obj.id
        });
        group.add(dimLabel);
      }
      shape = group;
      group.on("click tap", (e) => {
        const editable = isObjectEditable(obj);
        if (appState.currentTool === "eraser" && editable) {
          e.cancelBubble = true;
          if (callbacks.onDelete) callbacks.onDelete(obj.id);
        } else if (appState.currentTool === "select" && editable) {
          e.cancelBubble = true;
          if (callbacks.onSelect) callbacks.onSelect(obj.id);
        } else if (appState.currentTool === "wall") {
          if (callbacks.onWallClick) callbacks.onWallClick();
        }
      });
      shape.on("mouseenter", () => {
        const editable = isObjectEditable(obj);
        if (appState.currentTool === "eraser" && editable) {
          line.opacity(0.5);
          line.stroke("#A65E44");
          contentLayer.batchDraw();
          document.body.style.cursor = "pointer";
        } else if (appState.currentTool === "select" && editable) {
          line.opacity(0.8);
          contentLayer.batchDraw();
          document.body.style.cursor = "pointer";
        } else if (appState.currentTool === "wall") {
          line.stroke("#F3C044");
          line.strokeWidth(screenSize2(WALL_THICKNESS + 2));
          contentLayer.batchDraw();
          document.body.style.cursor = "crosshair";
        }
        appState.hoveredId = obj.id;
      });
      shape.on("mouseleave", () => {
        line.opacity(1);
        line.stroke("#2C3338");
        line.strokeWidth(screenSize2(WALL_THICKNESS));
        contentLayer.batchDraw();
        if (callbacks.getCursorForTool) document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
        appState.hoveredId = null;
      });
    } else if (obj.type === "rectangle") {
      const editable = isObjectEditable(obj);
      shape = new Konva.Rect({
        id: obj.id,
        x: obj.x,
        y: obj.y,
        width: obj.width,
        height: obj.height,
        stroke: obj.stroke || "#2C3338",
        strokeWidth: screenSize2(obj.strokeWidth || WALL_THICKNESS),
        fill: obj.fill || "",
        draggable: appState.currentTool === "select" && editable
      });
      let widthLabel = null, heightLabel = null, heightText = null;
      if (appState.dimensionsVisible) {
        const widthInches = pixelsToInches(obj.width);
        const heightInches = pixelsToInches(obj.height);
        const fontSize = screenSize2(LABEL_FONT_SIZE);
        const widthText = formatDimension(widthInches);
        heightText = formatDimension(heightInches);
        widthLabel = new Konva.Text({
          x: obj.x + obj.width / 2,
          y: obj.y + obj.height + screenSize2(8),
          text: widthText,
          fontSize,
          fill: "#5C6367",
          fontStyle: "bold",
          offsetX: widthText.length * fontSize * 0.25,
          listening: false,
          name: "rect-label-" + obj.id
        });
        heightLabel = new Konva.Text({
          x: obj.x + obj.width + screenSize2(15),
          y: obj.y + obj.height / 2 + heightText.length * fontSize * 0.25,
          text: heightText,
          fontSize,
          fill: "#5C6367",
          fontStyle: "bold",
          rotation: -90,
          listening: false,
          name: "rect-label-" + obj.id
        });
        contentLayer.add(widthLabel, heightLabel);
      }
      shape.on("dragmove", () => {
        if (widthLabel && heightLabel) {
          const fontSize = screenSize2(LABEL_FONT_SIZE);
          widthLabel.x(shape.x() + shape.width() * shape.scaleX() / 2);
          widthLabel.y(shape.y() + shape.height() * shape.scaleY() + screenSize2(8));
          heightLabel.x(shape.x() + shape.width() * shape.scaleX() + screenSize2(15));
          heightLabel.y(shape.y() + shape.height() * shape.scaleY() / 2 + heightText.length * fontSize * 0.25);
        }
      });
      shape.on("dragend", () => {
        const current = state.objects.find((o) => o.id === obj.id);
        if (current) {
          saveSnapshot();
          current.x = shape.x();
          current.y = shape.y();
          if (appState.selectedId === obj.id && callbacks.onSelect) {
            callbacks.onSelect(obj.id);
          }
        }
      });
      shape.on("mouseenter", () => {
        const editable2 = isObjectEditable(obj);
        if ((appState.currentTool === "eraser" || appState.currentTool === "select") && editable2) {
          shape.opacity(appState.currentTool === "eraser" ? 0.5 : 0.8);
          contentLayer.batchDraw();
          document.body.style.cursor = "pointer";
        }
        appState.hoveredId = obj.id;
      });
      shape.on("mouseleave", () => {
        shape.opacity(1);
        contentLayer.batchDraw();
        if (callbacks.getCursorForTool) document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
        appState.hoveredId = null;
      });
      shape.on("click tap", (e) => {
        const editable2 = isObjectEditable(obj);
        if (appState.currentTool === "eraser" && editable2) {
          e.cancelBubble = true;
          if (callbacks.onDelete) callbacks.onDelete(obj.id);
        } else if (appState.currentTool === "select" && editable2) {
          e.cancelBubble = true;
          if (callbacks.onSelect) callbacks.onSelect(obj.id);
        } else if (appState.currentTool === "wall") {
          if (callbacks.onWallClick) callbacks.onWallClick();
        } else if (appState.currentTool === "rectangle") {
          if (callbacks.onRectClick) callbacks.onRectClick();
        } else if (appState.currentTool === "text") {
          if (callbacks.onTextClick) callbacks.onTextClick();
        }
      });
    } else if (obj.type === "text" || obj.type === "label") {
      const editable = isObjectEditable(obj);
      shape = new Konva.Text({
        id: obj.id,
        x: obj.x,
        y: obj.y,
        text: obj.content,
        fontSize: obj.fontSize || 14,
        fill: obj.color || "#2C3338",
        fontStyle: obj.fontStyle || "bold",
        draggable: appState.currentTool === "select" && editable
      });
      shape.on("dragend", () => {
        const current = state.objects.find((o) => o.id === obj.id);
        if (current) {
          saveSnapshot();
          current.x = shape.x();
          current.y = shape.y();
          if (appState.selectedId === obj.id && callbacks.onSelect) {
            callbacks.onSelect(obj.id);
          }
        }
      });
      shape.on("mouseenter", () => {
        const editable2 = isObjectEditable(obj);
        if ((appState.currentTool === "eraser" || appState.currentTool === "select") && editable2) {
          shape.opacity(appState.currentTool === "eraser" ? 0.5 : 0.8);
          contentLayer.batchDraw();
          document.body.style.cursor = "pointer";
        }
        appState.hoveredId = obj.id;
      });
      shape.on("mouseleave", () => {
        shape.opacity(1);
        contentLayer.batchDraw();
        if (callbacks.getCursorForTool) document.body.style.cursor = callbacks.getCursorForTool(appState.currentTool);
        appState.hoveredId = null;
      });
      shape.on("click tap", (e) => {
        const editable2 = isObjectEditable(obj);
        if (appState.currentTool === "eraser" && editable2) {
          e.cancelBubble = true;
          if (callbacks.onDelete) callbacks.onDelete(obj.id);
        } else if (appState.currentTool === "select" && editable2) {
          e.cancelBubble = true;
          if (callbacks.onSelect) callbacks.onSelect(obj.id);
        } else if (appState.currentTool === "text" && editable2) {
          e.cancelBubble = true;
          if (callbacks.onTextEdit) callbacks.onTextEdit(obj.id);
        } else if (appState.currentTool === "wall") {
          if (callbacks.onWallClick) callbacks.onWallClick();
        } else if (appState.currentTool === "rectangle") {
          if (callbacks.onRectClick) callbacks.onRectClick();
        }
      });
      shape.on("dblclick dbltap", (e) => {
        const editable2 = isObjectEditable(obj);
        if (appState.currentTool === "select" && editable2) {
          e.cancelBubble = true;
          if (callbacks.onTextEdit) callbacks.onTextEdit(obj.id);
        }
      });
    }
    if (shape) contentLayer.add(shape);
  }

  // js/tools/wall-tool.js
  function screenSize3(pixels) {
    return pixels / stage.scaleX();
  }
  var callbacks2 = {
    renderAllObjects: null,
    moveTextToTop: null
  };
  function setWallToolCallbacks(cb) {
    callbacks2 = { ...callbacks2, ...cb };
  }
  var wallStart = null;
  var ghostLine = null;
  var ghostLabel = null;
  var startSnapIndicator = null;
  var endSnapIndicator = null;
  function handleWallClick(x, y) {
    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
      updateStatusBar(`Cannot draw: layer "${activeLayer?.name || "unknown"}" is ${activeLayer?.locked ? "locked" : "hidden"}`);
      return;
    }
    const axisLock = getAxisLock(wallStart, x, y);
    const snapped = getSnappedPoint(x, y, axisLock);
    if (!wallStart) {
      wallStart = snapped;
      updateStatusBar("Click to finish wall (Shift: axis lock, Ctrl/Cmd: foot grid)");
    } else {
      if (distance(wallStart.x, wallStart.y, snapped.x, snapped.y) > 10) {
        saveSnapshot();
        state.objects.push({
          type: "wall",
          id: generateUUID(),
          layerId: appState.activeLayerId,
          x1: wallStart.x,
          y1: wallStart.y,
          x2: snapped.x,
          y2: snapped.y
        });
        if (callbacks2.renderAllObjects) callbacks2.renderAllObjects();
        if (callbacks2.moveTextToTop) callbacks2.moveTextToTop();
      }
      wallStart = snapped;
      updateStatusBar("Wall added. Click to continue or switch tools");
    }
  }
  function handleWallMove(x, y) {
    clearWallGhost();
    if (!wallStart) {
      const snapped2 = getSnappedPoint(x, y);
      const nearVertex = findNearestVertex(x, y);
      if (nearVertex && distance(x, y, nearVertex.x, nearVertex.y) < SNAP_THRESHOLD) {
        showSnapIndicator(nearVertex.x, nearVertex.y, "start");
      }
      return;
    }
    const axisLock = getAxisLock(wallStart, x, y);
    const snapped = getSnappedPoint(x, y, axisLock);
    ghostLine = new Konva.Line({
      points: [wallStart.x, wallStart.y, snapped.x, snapped.y],
      stroke: "#528A81",
      strokeWidth: screenSize3(WALL_THICKNESS),
      lineCap: "round",
      opacity: 0.6,
      dash: [screenSize3(10), screenSize3(5)],
      listening: false
    });
    uiLayer.add(ghostLine);
    const len = distance(wallStart.x, wallStart.y, snapped.x, snapped.y);
    const inches = pixelsToInches(len);
    const midX = (wallStart.x + snapped.x) / 2;
    const midY = (wallStart.y + snapped.y) / 2;
    const angle = Math.atan2(snapped.y - wallStart.y, snapped.x - wallStart.x) * 180 / Math.PI;
    const normAngle = (angle % 360 + 360) % 360;
    const textRot = normAngle > 90 && normAngle < 270 ? angle + 180 : angle;
    const fontSize = screenSize3(LABEL_FONT_SIZE + 2);
    const labelText = formatDimension(inches);
    ghostLabel = new Konva.Text({
      x: midX,
      y: midY - screenSize3(20),
      text: labelText,
      fontSize,
      fill: "#528A81",
      fontStyle: "bold",
      rotation: textRot,
      offsetX: labelText.length * fontSize * 0.25,
      listening: false
    });
    uiLayer.add(ghostLabel);
    showSnapIndicator(wallStart.x, wallStart.y, "start");
    showSnapIndicator(snapped.x, snapped.y, "end");
    uiLayer.batchDraw();
  }
  function showSnapIndicator(x, y, type) {
    const indicator = new Konva.Circle({
      x,
      y,
      radius: screenSize3(HANDLE_RADIUS - 2),
      fill: "#528A81",
      stroke: "#2D453E",
      strokeWidth: screenSize3(HANDLE_STROKE),
      listening: false
    });
    if (type === "start") {
      if (startSnapIndicator) startSnapIndicator.destroy();
      startSnapIndicator = indicator;
    } else {
      if (endSnapIndicator) endSnapIndicator.destroy();
      endSnapIndicator = indicator;
    }
    uiLayer.add(indicator);
  }
  function clearWallGhost() {
    if (ghostLine) {
      ghostLine.destroy();
      ghostLine = null;
    }
    if (ghostLabel) {
      ghostLabel.destroy();
      ghostLabel = null;
    }
    if (startSnapIndicator) {
      startSnapIndicator.destroy();
      startSnapIndicator = null;
    }
    if (endSnapIndicator) {
      endSnapIndicator.destroy();
      endSnapIndicator = null;
    }
    uiLayer.batchDraw();
  }
  function resetWallTool() {
    wallStart = null;
    clearWallGhost();
  }
  function getWallStart() {
    return wallStart;
  }

  // js/tools/rectangle-tool.js
  function screenSize4(pixels) {
    return pixels / stage.scaleX();
  }
  var callbacks3 = {
    renderAllObjects: null,
    moveTextToTop: null
  };
  function setRectangleToolCallbacks(cb) {
    callbacks3 = { ...callbacks3, ...cb };
  }
  var rectStart = null;
  var ghostRect = null;
  var ghostDimLabels = { width: null, height: null };
  function handleRectangleClick(x, y) {
    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
      updateStatusBar(`Cannot draw: layer "${activeLayer?.name || "unknown"}" is ${activeLayer?.locked ? "locked" : "hidden"}`);
      return;
    }
    const snapped = getSnappedPoint(x, y);
    if (!rectStart) {
      rectStart = snapped;
      updateStatusBar("Click to set opposite corner");
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
          type: "rectangle",
          id: generateUUID(),
          layerId: appState.activeLayerId,
          x: minX,
          y: minY,
          width,
          height,
          stroke: appState.rectangleColor,
          strokeWidth: WALL_THICKNESS,
          fill: appState.rectangleFilled ? appState.rectangleColor : ""
        });
        if (callbacks3.renderAllObjects) callbacks3.renderAllObjects();
        if (callbacks3.moveTextToTop) callbacks3.moveTextToTop();
        updateStatusBar("Rectangle added");
      }
      rectStart = null;
      clearRectangleGhost();
    }
  }
  function handleRectangleMove(x, y) {
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
      x: minX,
      y: minY,
      width,
      height,
      stroke: appState.rectangleColor,
      strokeWidth: screenSize4(WALL_THICKNESS),
      fill: appState.rectangleFilled ? appState.rectangleColor : "",
      opacity: 0.6,
      dash: [screenSize4(10), screenSize4(5)],
      listening: false
    });
    uiLayer.add(ghostRect);
    const widthText = formatDimension(pixelsToInches(width));
    const heightText = formatDimension(pixelsToInches(height));
    const fontSize = screenSize4(LABEL_FONT_SIZE);
    ghostDimLabels.width = new Konva.Text({
      x: minX + width / 2,
      y: maxY + screenSize4(8),
      text: widthText,
      fontSize,
      fill: "#528A81",
      fontStyle: "bold",
      offsetX: widthText.length * fontSize * 0.25,
      listening: false
    });
    ghostDimLabels.height = new Konva.Text({
      x: maxX + screenSize4(15),
      y: minY + height / 2 + heightText.length * fontSize * 0.25,
      text: heightText,
      fontSize,
      fill: "#528A81",
      fontStyle: "bold",
      rotation: -90,
      listening: false
    });
    uiLayer.add(ghostDimLabels.width, ghostDimLabels.height);
    uiLayer.batchDraw();
  }
  function clearRectangleGhost() {
    if (ghostRect) {
      ghostRect.destroy();
      ghostRect = null;
    }
    if (ghostDimLabels.width) {
      ghostDimLabels.width.destroy();
      ghostDimLabels.width = null;
    }
    if (ghostDimLabels.height) {
      ghostDimLabels.height.destroy();
      ghostDimLabels.height = null;
    }
    uiLayer.batchDraw();
  }
  function resetRectangleTool() {
    rectStart = null;
    clearRectangleGhost();
  }
  function getRectStart() {
    return rectStart;
  }

  // js/tools/text-tool.js
  var callbacks4 = {
    renderAllObjects: null,
    moveTextToTop: null
  };
  function setTextToolCallbacks(cb) {
    callbacks4 = { ...callbacks4, ...cb };
  }
  function handleTextClick(x, y) {
    const activeLayer = getActiveLayer();
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
      updateStatusBar(`Cannot draw: layer "${activeLayer?.name || "unknown"}" is ${activeLayer?.locked ? "locked" : "hidden"}`);
      return;
    }
    const snapped = getSnappedPoint(x, y);
    const content = prompt("Enter label text:");
    if (content && content.trim()) {
      saveSnapshot();
      state.objects.push({
        type: "label",
        id: generateUUID(),
        layerId: appState.activeLayerId,
        x: snapped.x,
        y: snapped.y,
        content: content.trim(),
        fontSize: 14,
        color: "#2C3338",
        fontStyle: "bold"
      });
      if (callbacks4.renderAllObjects) callbacks4.renderAllObjects();
      if (callbacks4.moveTextToTop) callbacks4.moveTextToTop();
      updateStatusBar("Label added");
    }
  }
  function handleTextEdit(id) {
    const obj = state.objects.find((o) => o.id === id);
    if (!obj || obj.type !== "text" && obj.type !== "label") return;
    const newContent = prompt("Edit label text:", obj.content);
    if (newContent !== null && newContent.trim() && newContent !== obj.content) {
      saveSnapshot();
      obj.content = newContent.trim();
      const shape = contentLayer.findOne("#" + id);
      if (shape) {
        shape.text(newContent.trim());
        contentLayer.batchDraw();
      }
      updateStatusBar("Label updated");
    }
  }

  // js/file-io.js
  var BACKGROUND_COLOR = "#F2F1EF";
  var callbacks5 = {
    renderAllObjects: null,
    deselectObject: null,
    renderLayerPanel: null
  };
  function setFileIOCallbacks(cb) {
    callbacks5 = { ...callbacks5, ...cb };
  }
  function newLayout() {
    if (state.objects.length > 0) {
      if (!confirm("Create new layout? Unsaved changes will be lost.")) return;
    }
    state.objects = [];
    state.layers = [
      { id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false, order: 0 }
    ];
    appState.activeLayerId = DEFAULT_LAYER_ID;
    history.undoStack = [];
    history.redoStack = [];
    updateUndoRedoButtons();
    if (callbacks5.deselectObject) callbacks5.deselectObject();
    if (callbacks5.renderLayerPanel) callbacks5.renderLayerPanel();
    if (callbacks5.renderAllObjects) callbacks5.renderAllObjects();
    updateStatusBar("New layout created");
  }
  function saveLayout() {
    const data = {
      version: state.version,
      scale: SCALE,
      unit: "inches",
      created: (/* @__PURE__ */ new Date()).toISOString(),
      layers: state.layers,
      objects: state.objects
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "floor-plan.layout";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateStatusBar("Layout saved");
  }
  function loadLayout() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".layout,.json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (data.objects && Array.isArray(data.objects)) {
            state.objects = data.objects;
            if (data.layers && Array.isArray(data.layers) && data.layers.length > 0) {
              state.layers = data.layers;
              appState.activeLayerId = state.layers[0].id;
            } else {
              state.layers = [
                { id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false, order: 0 }
              ];
              appState.activeLayerId = DEFAULT_LAYER_ID;
              state.objects.forEach((obj) => {
                if (!obj.layerId) obj.layerId = DEFAULT_LAYER_ID;
              });
            }
            history.undoStack = [];
            history.redoStack = [];
            updateUndoRedoButtons();
            if (callbacks5.deselectObject) callbacks5.deselectObject();
            if (callbacks5.renderLayerPanel) callbacks5.renderLayerPanel();
            if (callbacks5.renderAllObjects) callbacks5.renderAllObjects();
            updateStatusBar(`Loaded: ${file.name}`);
          } else {
            throw new Error("Invalid layout file");
          }
        } catch (err) {
          alert("Failed to load layout: " + err.message);
          updateStatusBar("Load failed");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
  async function exportPNG() {
    const gridWasVisible = gridLayer.visible();
    const uiWasVisible = uiLayer.visible();
    gridLayer.visible(false);
    uiLayer.visible(false);
    const bgRect = new Konva.Rect({
      x: -1e4,
      y: -1e4,
      width: 2e4,
      height: 2e4,
      fill: BACKGROUND_COLOR,
      listening: false
    });
    contentLayer.add(bgRect);
    bgRect.moveToBottom();
    contentLayer.batchDraw();
    const dataURL = stage.toDataURL({
      pixelRatio: 2,
      mimeType: "image/png"
    });
    bgRect.destroy();
    gridLayer.visible(gridWasVisible);
    uiLayer.visible(uiWasVisible);
    contentLayer.batchDraw();
    const response = await fetch(dataURL);
    const blob = await response.blob();
    if ("showSaveFilePicker" in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: "floor-plan.png",
          types: [{
            description: "PNG Image",
            accept: { "image/png": [".png"] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        updateStatusBar("Exported PNG: " + handle.name);
        return;
      } catch (err) {
        if (err.name === "AbortError") {
          updateStatusBar("Export cancelled");
          return;
        }
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "floor-plan.png";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    updateStatusBar("Exported PNG");
  }

  // js/keyboard.js
  var callbacks6 = {
    deleteSelectedObject: null,
    switchTool: null,
    newLayout: null,
    saveLayout: null,
    loadLayout: null,
    exportPNG: null,
    copySelection: null,
    pasteSelection: null
  };
  function setKeyboardCallbacks(cb) {
    callbacks6 = { ...callbacks6, ...cb };
  }
  function handleKeyDown(e) {
    appState.shiftPressed = e.shiftKey;
    appState.ctrlPressed = e.ctrlKey;
    appState.metaPressed = e.metaKey;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    const modKey = isModKey(e);
    if (modKey && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (modKey && e.shiftKey && e.key === "z" || modKey && e.key === "y") {
      e.preventDefault();
      redo();
      return;
    }
    if (modKey && e.key === "n") {
      e.preventDefault();
      if (callbacks6.newLayout) callbacks6.newLayout();
      return;
    }
    if (modKey && e.key === "s") {
      e.preventDefault();
      if (callbacks6.saveLayout) callbacks6.saveLayout();
      return;
    }
    if (modKey && e.key === "o") {
      e.preventDefault();
      if (callbacks6.loadLayout) callbacks6.loadLayout();
      return;
    }
    if (modKey && e.shiftKey && e.key === "e") {
      e.preventDefault();
      if (callbacks6.exportPNG) callbacks6.exportPNG();
      return;
    }
    if (modKey && e.key === "c") {
      e.preventDefault();
      if (callbacks6.copySelection) callbacks6.copySelection();
      return;
    }
    if (modKey && e.key === "v") {
      e.preventDefault();
      if (callbacks6.pasteSelection) callbacks6.pasteSelection();
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if ((appState.selectedId || appState.selectedIds.length > 0) && callbacks6.deleteSelectedObject) {
        e.preventDefault();
        callbacks6.deleteSelectedObject();
      }
      return;
    }
    if (e.key === "Escape") {
      if (callbacks6.switchTool) callbacks6.switchTool("select");
      return;
    }
    if (!modKey) {
      switch (e.key.toLowerCase()) {
        case "v":
        case "s":
          if (callbacks6.switchTool) callbacks6.switchTool("select");
          break;
        case "w":
          if (callbacks6.switchTool) callbacks6.switchTool("wall");
          break;
        case "r":
          if (callbacks6.switchTool) callbacks6.switchTool("rectangle");
          break;
        case "t":
          if (callbacks6.switchTool) callbacks6.switchTool("text");
          break;
        case "e":
        case "x":
          if (callbacks6.switchTool) callbacks6.switchTool("eraser");
          break;
      }
    }
  }
  function handleKeyUp(e) {
    appState.shiftPressed = e.shiftKey;
    appState.ctrlPressed = e.ctrlKey;
    appState.metaPressed = e.metaKey;
  }

  // js/ui-helpers.js
  var clearGhostShapes = () => {
    uiLayer.destroyChildren();
    uiLayer.batchDraw();
  };
  var getCursorForTool = (tool) => ({
    wall: "crosshair",
    rectangle: "crosshair",
    text: "text",
    eraser: "not-allowed"
  })[tool] || "default";
  var getStatusForTool = (tool) => ({
    select: "Select tool | Click objects to select",
    wall: "Wall tool | Click to start, click to finish",
    rectangle: "Rectangle tool | Click to start, click for opposite corner",
    text: "Text tool | Click to add label",
    eraser: "Eraser | Click or drag to delete"
  })[tool] || "";
  var showRectanglePanel2 = (show) => {
    document.getElementById("rectangle-panel").classList.toggle("hidden", !show);
  };
  function initializeColorPalette() {
    const palette = document.getElementById("color-palette");
    palette.innerHTML = "";
    COLOR_PALETTE.forEach((color) => {
      const swatch = document.createElement("div");
      swatch.className = "color-swatch" + (color === appState.rectangleColor ? " selected" : "");
      swatch.style.backgroundColor = color;
      swatch.onclick = () => {
        appState.rectangleColor = color;
        updateColorSelection(color);
        if (appState.selectedId) {
          const obj = state.objects.find((o) => o.id === appState.selectedId);
          if (obj?.type === "rectangle") {
            saveSnapshot();
            obj.stroke = color;
            if (obj.fill) obj.fill = color;
            const shape = contentLayer.findOne("#" + obj.id);
            if (shape) {
              shape.stroke(color);
              if (shape.fill()) shape.fill(color);
              contentLayer.batchDraw();
            }
          }
        }
      };
      palette.appendChild(swatch);
    });
  }
  function updateColorSelection(selectedColor) {
    const palette = document.getElementById("color-palette");
    palette.querySelectorAll(".color-swatch").forEach((swatch, i) => {
      swatch.classList.toggle("selected", COLOR_PALETTE[i] === selectedColor);
    });
  }
  var layerCallbacks = { renderAllObjects: null, saveSnapshot: null };
  function setLayerCallbacks(cb) {
    layerCallbacks = { ...layerCallbacks, ...cb };
  }
  function moveSelectedUp() {
    if (!appState.selectedId) return false;
    const idx = state.objects.findIndex((o) => o.id === appState.selectedId);
    if (idx === -1 || idx === state.objects.length - 1) return false;
    if (layerCallbacks.saveSnapshot) layerCallbacks.saveSnapshot();
    const obj = state.objects.splice(idx, 1)[0];
    state.objects.splice(idx + 1, 0, obj);
    if (layerCallbacks.renderAllObjects) layerCallbacks.renderAllObjects();
    return true;
  }
  function moveSelectedDown() {
    if (!appState.selectedId) return false;
    const idx = state.objects.findIndex((o) => o.id === appState.selectedId);
    if (idx <= 0) return false;
    if (layerCallbacks.saveSnapshot) layerCallbacks.saveSnapshot();
    const obj = state.objects.splice(idx, 1)[0];
    state.objects.splice(idx - 1, 0, obj);
    if (layerCallbacks.renderAllObjects) layerCallbacks.renderAllObjects();
    return true;
  }

  // js/layer-panel.js
  var callbacks7 = {
    renderAllObjects: null,
    deselectObject: null
  };
  function setLayerPanelCallbacks(cb) {
    callbacks7 = { ...callbacks7, ...cb };
  }
  var contextMenuLayerId = null;
  function renderLayerPanel() {
    const list = document.getElementById("layer-list");
    list.innerHTML = "";
    const sortedLayers = [...state.layers].sort((a, b) => b.order - a.order);
    sortedLayers.forEach((layer) => {
      const row = document.createElement("div");
      row.className = "layer-row" + (layer.id === appState.activeLayerId ? " active" : "") + (layer.locked ? " locked" : "");
      row.dataset.layerId = layer.id;
      const visIcon = document.createElement("div");
      visIcon.className = "layer-icon";
      visIcon.innerHTML = layer.visible ? "&#128065;" : "&#128064;";
      visIcon.title = layer.visible ? "Hide layer" : "Show layer";
      visIcon.onclick = (e) => {
        e.stopPropagation();
        toggleLayerVisibility(layer.id);
      };
      const lockIcon = document.createElement("div");
      lockIcon.className = "layer-icon";
      lockIcon.innerHTML = layer.locked ? "&#128274;" : "&#128275;";
      lockIcon.title = layer.locked ? "Unlock layer" : "Lock layer";
      lockIcon.onclick = (e) => {
        e.stopPropagation();
        toggleLayerLock(layer.id);
      };
      const name = document.createElement("div");
      name.className = "layer-name";
      name.textContent = layer.name;
      name.title = layer.name;
      const menuBtn = document.createElement("div");
      menuBtn.className = "layer-menu-btn";
      menuBtn.innerHTML = "&#8942;";
      menuBtn.title = "Layer options";
      menuBtn.onclick = (e) => {
        e.stopPropagation();
        showContextMenu(e, layer.id);
      };
      row.appendChild(visIcon);
      row.appendChild(lockIcon);
      row.appendChild(name);
      row.appendChild(menuBtn);
      row.onclick = () => selectLayer(layer.id);
      list.appendChild(row);
    });
    updateMoveToLayerButton2();
  }
  function selectLayer(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    appState.activeLayerId = id;
    renderLayerPanel();
    updateStatusBar(`Active layer: ${layer.name}`);
  }
  function toggleLayerVisibility(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    saveSnapshot();
    layer.visible = !layer.visible;
    if (!layer.visible) {
      deselectObjectsOnLayer(id);
    }
    renderLayerPanel();
    if (callbacks7.renderAllObjects) callbacks7.renderAllObjects();
    updateStatusBar(`${layer.name}: ${layer.visible ? "visible" : "hidden"}`);
  }
  function toggleLayerLock(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    saveSnapshot();
    layer.locked = !layer.locked;
    if (layer.locked) {
      deselectObjectsOnLayer(id);
    }
    renderLayerPanel();
    if (callbacks7.renderAllObjects) callbacks7.renderAllObjects();
    updateStatusBar(`${layer.name}: ${layer.locked ? "locked" : "unlocked"}`);
  }
  function deselectObjectsOnLayer(layerId) {
    if (appState.selectedId) {
      const obj = state.objects.find((o) => o.id === appState.selectedId);
      if (obj && (obj.layerId || DEFAULT_LAYER_ID) === layerId) {
        if (callbacks7.deselectObject) callbacks7.deselectObject();
      }
    }
    if (appState.selectedIds.length > 0) {
      const remaining = appState.selectedIds.filter((id) => {
        const obj = state.objects.find((o) => o.id === id);
        return obj && (obj.layerId || DEFAULT_LAYER_ID) !== layerId;
      });
      if (remaining.length !== appState.selectedIds.length) {
        appState.selectedIds = remaining;
        if (callbacks7.renderAllObjects) callbacks7.renderAllObjects();
      }
    }
  }
  function addLayer() {
    saveSnapshot();
    const maxOrder = Math.max(...state.layers.map((l) => l.order), -1);
    const layerNum = state.layers.length + 1;
    const newLayer = {
      id: generateUUID(),
      name: `Layer ${layerNum}`,
      visible: true,
      locked: false,
      order: maxOrder + 1
    };
    state.layers.push(newLayer);
    appState.activeLayerId = newLayer.id;
    renderLayerPanel();
    updateStatusBar(`Added ${newLayer.name}`);
  }
  function deleteLayer(id) {
    if (state.layers.length <= 1) {
      updateStatusBar("Cannot delete the only layer");
      return;
    }
    const layer = getLayerById(id);
    if (!layer) return;
    saveSnapshot();
    const targetLayer = state.layers.find((l) => l.id !== id);
    state.objects.forEach((obj) => {
      if ((obj.layerId || DEFAULT_LAYER_ID) === id) {
        obj.layerId = targetLayer.id;
      }
    });
    const idx = state.layers.findIndex((l) => l.id === id);
    state.layers.splice(idx, 1);
    if (appState.activeLayerId === id) {
      appState.activeLayerId = state.layers[0].id;
    }
    renderLayerPanel();
    if (callbacks7.renderAllObjects) callbacks7.renderAllObjects();
    updateStatusBar(`Deleted ${layer.name}, objects moved to ${targetLayer.name}`);
  }
  function renameLayer(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    const newName = prompt("Layer name:", layer.name);
    if (newName && newName.trim() && newName !== layer.name) {
      saveSnapshot();
      layer.name = newName.trim();
      renderLayerPanel();
      updateStatusBar(`Renamed to ${layer.name}`);
    }
  }
  function moveLayerUp(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
    const idx = sortedLayers.findIndex((l) => l.id === id);
    if (idx >= sortedLayers.length - 1) return;
    saveSnapshot();
    const swapWith = sortedLayers[idx + 1];
    const tempOrder = layer.order;
    layer.order = swapWith.order;
    swapWith.order = tempOrder;
    renderLayerPanel();
    if (callbacks7.renderAllObjects) callbacks7.renderAllObjects();
  }
  function moveLayerDown(id) {
    const layer = getLayerById(id);
    if (!layer) return;
    const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
    const idx = sortedLayers.findIndex((l) => l.id === id);
    if (idx <= 0) return;
    saveSnapshot();
    const swapWith = sortedLayers[idx - 1];
    const tempOrder = layer.order;
    layer.order = swapWith.order;
    swapWith.order = tempOrder;
    renderLayerPanel();
    if (callbacks7.renderAllObjects) callbacks7.renderAllObjects();
  }
  function moveSelectedToActiveLayer() {
    const activeLayer = getActiveLayer();
    if (!activeLayer) return;
    if (activeLayer.locked) {
      updateStatusBar(`Cannot move to locked layer: ${activeLayer.name}`);
      return;
    }
    const selectedIds = appState.selectedIds.length > 0 ? appState.selectedIds : appState.selectedId ? [appState.selectedId] : [];
    if (selectedIds.length === 0) {
      updateStatusBar("No objects selected");
      return;
    }
    saveSnapshot();
    let movedCount = 0;
    selectedIds.forEach((id) => {
      const obj = state.objects.find((o) => o.id === id);
      if (obj && (obj.layerId || DEFAULT_LAYER_ID) !== activeLayer.id) {
        obj.layerId = activeLayer.id;
        movedCount++;
      }
    });
    if (movedCount > 0) {
      if (callbacks7.renderAllObjects) callbacks7.renderAllObjects();
      updateStatusBar(`Moved ${movedCount} object(s) to ${activeLayer.name}`);
    } else {
      updateStatusBar("Objects already on active layer");
    }
  }
  function showContextMenu(e, layerId) {
    contextMenuLayerId = layerId;
    const menu = document.getElementById("layer-context-menu");
    menu.style.left = e.clientX + "px";
    menu.style.top = e.clientY + "px";
    menu.classList.remove("hidden");
    const layer = getLayerById(layerId);
    const sortedLayers = [...state.layers].sort((a, b) => a.order - b.order);
    const idx = sortedLayers.findIndex((l) => l.id === layerId);
    menu.querySelector('[data-action="move-up"]').disabled = idx >= sortedLayers.length - 1;
    menu.querySelector('[data-action="move-down"]').disabled = idx <= 0;
    menu.querySelector('[data-action="delete"]').disabled = state.layers.length <= 1;
  }
  function hideContextMenu() {
    document.getElementById("layer-context-menu").classList.add("hidden");
    contextMenuLayerId = null;
  }
  function handleContextMenuAction(action) {
    if (!contextMenuLayerId) return;
    const id = contextMenuLayerId;
    hideContextMenu();
    switch (action) {
      case "rename":
        renameLayer(id);
        break;
      case "move-up":
        moveLayerUp(id);
        break;
      case "move-down":
        moveLayerDown(id);
        break;
      case "delete":
        deleteLayer(id);
        break;
    }
  }
  function updateMoveToLayerButton2() {
    const btn = document.getElementById("move-to-layer-btn");
    const hasSelection = appState.selectedId || appState.selectedIds.length > 0;
    btn.disabled = !hasSelection;
  }

  // js/app.js
  initializeKonva();
  setHistoryCallbacks({
    renderAllObjects: renderAllObjects2
  });
  setRenderingCallbacks({
    onDelete: deleteObjectById,
    onSelect: selectObject,
    onWallClick: () => {
      const pos = getCanvasPointerPosition();
      if (pos) handleWallClick(pos.x, pos.y);
    },
    onRectClick: () => {
      const pos = getCanvasPointerPosition();
      if (pos) handleRectangleClick(pos.x, pos.y);
    },
    onTextClick: () => {
      const pos = getCanvasPointerPosition();
      if (pos) handleTextClick(pos.x, pos.y);
    },
    onTextEdit: handleTextEdit,
    getCursorForTool,
    getStatusForTool,
    updateStatusBar
  });
  setSelectionCallbacks({
    renderAllObjects: renderAllObjects2,
    showRectanglePanel: showRectanglePanel2,
    updateRectanglePanelFromSelection: updateRectanglePanelFromSelection2,
    updateMoveToLayerButton: updateMoveToLayerButton2
  });
  setWallToolCallbacks({
    renderAllObjects: renderAllObjects2,
    moveTextToTop
  });
  setRectangleToolCallbacks({
    renderAllObjects: renderAllObjects2,
    moveTextToTop
  });
  setTextToolCallbacks({
    renderAllObjects: renderAllObjects2,
    moveTextToTop
  });
  setFileIOCallbacks({
    renderAllObjects: renderAllObjects2,
    deselectObject,
    renderLayerPanel
  });
  setKeyboardCallbacks({
    deleteSelectedObject,
    switchTool,
    newLayout,
    saveLayout,
    loadLayout,
    exportPNG,
    copySelection,
    pasteSelection
  });
  setLayerCallbacks({
    renderAllObjects: renderAllObjects2,
    saveSnapshot
  });
  setLayerPanelCallbacks({
    renderAllObjects: renderAllObjects2,
    deselectObject
  });
  setGridCallbacks({
    renderAllObjects: renderAllObjects2
  });
  function switchTool(tool) {
    appState.currentTool = tool;
    clearGhostShapes();
    resetWallTool();
    resetRectangleTool();
    deselectObject();
    document.querySelectorAll(".tool-button").forEach((btn) => {
      const isActive = btn.dataset.tool === tool;
      btn.classList.toggle("active", isActive);
      btn.classList.toggle("bg-sage-400", isActive);
      btn.classList.toggle("text-cream-100", isActive);
      btn.classList.toggle("border-sage-400", isActive);
      btn.classList.toggle("bg-cream-100", !isActive);
      btn.classList.toggle("text-slate-700", !isActive);
      btn.classList.toggle("border-cream-300", !isActive);
    });
    contentLayer.find("Text, Rect").forEach((shape) => shape.draggable(tool === "select"));
    contentLayer.find("Group").forEach((shape) => {
      if (shape.name() !== "wall-group") shape.draggable(tool === "select");
    });
    showRectanglePanel2(tool === "rectangle");
    document.body.style.cursor = getCursorForTool(tool);
    updateStatusBar(getStatusForTool(tool));
  }
  function updateRectanglePanelFromSelection2(obj) {
    if (obj.type !== "rectangle") return;
    appState.rectangleColor = obj.stroke || "#2C3338";
    appState.rectangleFilled = !!obj.fill;
    document.getElementById("rect-fill").checked = appState.rectangleFilled;
    updateColorSelection(appState.rectangleColor);
  }
  stage.on("wheel", handleZoom);
  stage.on("click tap", (e) => {
    if (appState.middleMouseUsed) {
      appState.middleMouseUsed = false;
      return;
    }
    if (e.target !== stage) return;
    const pos = getCanvasPointerPosition();
    if (!pos) return;
    if (appState.currentTool === "select") deselectObject();
    else if (appState.currentTool === "wall") handleWallClick(pos.x, pos.y);
    else if (appState.currentTool === "rectangle") handleRectangleClick(pos.x, pos.y);
    else if (appState.currentTool === "text") handleTextClick(pos.x, pos.y);
  });
  stage.on("mousemove", (e) => {
    const screenPos = stage.getPointerPosition();
    if (!screenPos) return;
    if (appState.isPanning && appState.lastPanPoint) {
      stage.position({
        x: stage.x() + screenPos.x - appState.lastPanPoint.x,
        y: stage.y() + screenPos.y - appState.lastPanPoint.y
      });
      stage.batchDraw();
      drawGrid();
      renderAllObjects2();
      appState.lastPanPoint = screenPos;
      return;
    }
    const pos = getCanvasPointerPosition();
    if (!pos) return;
    if (appState.isErasing && appState.hoveredId && !appState.erasedIds.has(appState.hoveredId)) {
      appState.erasedIds.add(appState.hoveredId);
      const idx = state.objects.findIndex((o) => o.id === appState.hoveredId);
      if (idx !== -1) {
        state.objects.splice(idx, 1);
        renderAllObjects2();
      }
    }
    if (appState.currentTool === "wall") handleWallMove(pos.x, pos.y);
    else if (appState.currentTool === "rectangle") handleRectangleMove(pos.x, pos.y);
    else if (isBoxSelecting()) updateBoxSelect(pos.x, pos.y);
  });
  stage.on("mousedown touchstart", (e) => {
    if (e.evt.button === 1 || appState.spacePressed && e.target === stage) {
      e.evt.preventDefault();
      appState.isPanning = true;
      appState.middleMouseUsed = e.evt.button === 1;
      appState.lastPanPoint = stage.getPointerPosition();
      document.body.style.cursor = "grabbing";
      updateStatusBar("Panning...");
      return;
    }
    if (appState.currentTool === "eraser") {
      appState.isErasing = true;
      appState.erasedIds.clear();
      saveSnapshot();
      updateStatusBar("Erasing...");
    }
    if (appState.currentTool === "select" && e.target === stage && e.evt.button === 0) {
      const pos = getCanvasPointerPosition();
      if (pos) startBoxSelect(pos.x, pos.y);
    }
  });
  stage.on("mouseup touchend", () => {
    if (appState.isPanning) {
      appState.isPanning = false;
      appState.lastPanPoint = null;
      document.body.style.cursor = getCursorForTool(appState.currentTool);
      updateStatusBar(getStatusForTool(appState.currentTool));
      return;
    }
    if (appState.isErasing) {
      appState.isErasing = false;
      if (appState.erasedIds.size > 0) {
        updateStatusBar(`Erased ${appState.erasedIds.size} object(s)`);
      } else {
        updateStatusBar(getStatusForTool(appState.currentTool));
      }
      appState.erasedIds.clear();
    }
    if (isBoxSelecting()) {
      const pos = getCanvasPointerPosition();
      if (pos) endBoxSelect(pos.x, pos.y);
      else cancelBoxSelect();
    }
  });
  document.querySelectorAll(".tool-button").forEach((btn) => {
    btn.addEventListener("click", () => switchTool(btn.dataset.tool));
  });
  document.getElementById("grid-toggle").addEventListener("click", () => {
    appState.gridVisible = !appState.gridVisible;
    gridLayer.visible(appState.gridVisible);
    drawGrid();
    updateStatusBar(`Grid ${appState.gridVisible ? "shown" : "hidden"}`);
  });
  document.getElementById("dimensions-toggle").addEventListener("click", () => {
    appState.dimensionsVisible = !appState.dimensionsVisible;
    renderAllObjects2();
    updateStatusBar(`Dimensions ${appState.dimensionsVisible ? "shown" : "hidden"}`);
  });
  document.getElementById("reset-view").addEventListener("click", resetView);
  document.getElementById("undo-btn").addEventListener("click", undo);
  document.getElementById("redo-btn").addEventListener("click", redo);
  document.getElementById("move-up-btn").addEventListener("click", () => {
    if (moveSelectedUp()) updateStatusBar("Moved up");
  });
  document.getElementById("move-down-btn").addEventListener("click", () => {
    if (moveSelectedDown()) updateStatusBar("Moved down");
  });
  document.getElementById("new-btn").addEventListener("click", newLayout);
  document.getElementById("save-btn").addEventListener("click", saveLayout);
  document.getElementById("load-btn").addEventListener("click", loadLayout);
  document.getElementById("export-btn").addEventListener("click", exportPNG);
  document.getElementById("add-layer-btn").addEventListener("click", addLayer);
  document.getElementById("move-to-layer-btn").addEventListener("click", moveSelectedToActiveLayer);
  document.querySelectorAll(".layer-menu-item").forEach((item) => {
    item.addEventListener("click", () => handleContextMenuAction(item.dataset.action));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#layer-context-menu") && !e.target.closest(".layer-menu-btn")) {
      hideContextMenu();
    }
  });
  document.getElementById("file-input").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = JSON.parse(evt.target.result);
        if (!data.objects || !Array.isArray(data.objects)) {
          alert("Invalid layout file");
          return;
        }
        state.objects = data.objects;
        if (data.layers && Array.isArray(data.layers) && data.layers.length > 0) {
          state.layers = data.layers;
          appState.activeLayerId = state.layers[0].id;
        } else {
          state.layers = [
            { id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false, order: 0 }
          ];
          appState.activeLayerId = DEFAULT_LAYER_ID;
          state.objects.forEach((obj) => {
            if (!obj.layerId) obj.layerId = DEFAULT_LAYER_ID;
          });
        }
        history.undoStack = [];
        history.redoStack = [];
        updateUndoRedoButtons();
        deselectObject();
        renderLayerPanel();
        renderAllObjects2();
        updateStatusBar(`Loaded: ${file.name}`);
      } catch (err) {
        alert("Error loading file: " + err.message);
      }
    };
    reader.readAsText(file);
  });
  document.getElementById("rect-fill").addEventListener("change", (e) => {
    appState.rectangleFilled = e.target.checked;
    if (appState.selectedId) {
      const obj = state.objects.find((o) => o.id === appState.selectedId);
      if (obj?.type === "rectangle") {
        saveSnapshot();
        obj.fill = e.target.checked ? appState.rectangleColor : "";
        const shape = contentLayer.findOne("#" + obj.id);
        if (shape) {
          shape.fill(e.target.checked ? appState.rectangleColor : "");
          contentLayer.batchDraw();
        }
      }
    }
  });
  document.getElementById("dimension-input").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      const inches = parseDimension(e.target.value);
      if (!appState.selectedId || inches <= 0) return;
      const obj = state.objects.find((o) => o.id === appState.selectedId);
      if (!obj) return;
      saveSnapshot();
      if (obj.type === "wall") {
        const angle = Math.atan2(obj.y2 - obj.y1, obj.x2 - obj.x1);
        const px = inchesToPixels(inches);
        obj.x2 = obj.x1 + Math.cos(angle) * px;
        obj.y2 = obj.y1 + Math.sin(angle) * px;
      }
      renderAllObjects2();
      updateStatusBar("Dimensions updated");
    }
  });
  document.addEventListener("keydown", (e) => {
    const inInput = e.target.matches("input, select, textarea");
    if (e.key === " " && !inInput) {
      e.preventDefault();
      if (!appState.spacePressed) {
        appState.spacePressed = true;
        document.body.style.cursor = "grab";
        updateStatusBar("Pan mode");
      }
      return;
    }
    if (e.key === "Escape") {
      const isDrawing = getWallStart() !== null || getRectStart() !== null;
      if (isDrawing) {
        clearGhostShapes();
        resetWallTool();
        resetRectangleTool();
        updateStatusBar("Cancelled");
      } else {
        deselectObject();
      }
      return;
    }
    handleKeyDown(e);
  });
  document.addEventListener("keyup", (e) => {
    if (e.key === " ") {
      appState.spacePressed = false;
      if (!appState.isPanning) {
        document.body.style.cursor = getCursorForTool(appState.currentTool);
        updateStatusBar(getStatusForTool(appState.currentTool));
      }
    }
    handleKeyUp(e);
  });
  window.addEventListener("resize", handleResize);
  window.addEventListener("blur", () => {
    if (isBoxSelecting()) cancelBoxSelect();
  });
  document.addEventListener("mouseleave", () => {
    if (isBoxSelecting()) cancelBoxSelect();
  });
  document.addEventListener("mouseup", (e) => {
    if (isBoxSelecting() && !e.target.closest("#container")) {
      cancelBoxSelect();
    }
  });
  initializeColorPalette();
  renderLayerPanel();
  drawGrid();
  updateUndoRedoButtons();
  switchTool("select");
  updateStatusBar("SpacePlanner ready | Select tool active");
})();
