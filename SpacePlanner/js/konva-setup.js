// js/konva-setup.js - Konva.js initialization
// Selection UI (handles, highlights) is managed by selection.js on uiLayer

export let stage, gridLayer, contentLayer, uiLayer;

export function initializeKonva() {
  const width = window.innerWidth, height = window.innerHeight;
  stage = new Konva.Stage({
    container: 'container',
    width,
    height,
    pixelRatio: window.devicePixelRatio || 1
  });

  gridLayer = new Konva.Layer({ listening: false });
  contentLayer = new Konva.Layer();
  uiLayer = new Konva.Layer(); // Selection UI (handles, highlights, previews)

  stage.add(gridLayer, contentLayer, uiLayer);
}

export function getCanvasPointerPosition() {
  const pos = stage.getPointerPosition();
  if (!pos) return null;
  return stage.getAbsoluteTransform().copy().invert().point(pos);
}
