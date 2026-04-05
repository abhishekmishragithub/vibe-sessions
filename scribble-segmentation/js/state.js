// Shared mutable state and canvas references

// --- DOM refs (set by app.js init) ---
export let videoEl, outputCanvas, drawingCanvas, statusEl, errorOverlay, brushSlider, brushValEl;
export let outCtx, drawCtx;

// --- Offscreen canvases ---
export const maskCanvas = document.createElement('canvas');
maskCanvas.width = 1280; maskCanvas.height = 720;
export const maskCtx = maskCanvas.getContext('2d');

export const scribbleCanvas = document.createElement('canvas');
scribbleCanvas.width = 1280; scribbleCanvas.height = 720;
export const scribbleCtx = scribbleCanvas.getContext('2d');

export const tileCanvas = document.createElement('canvas');
export const tileCtx = tileCanvas.getContext('2d');

export const alphaMaskCanvas = document.createElement('canvas');
alphaMaskCanvas.width = 1280; alphaMaskCanvas.height = 720;
export const alphaMaskCtx = alphaMaskCanvas.getContext('2d', { willReadFrequently: true });

// --- Stroke state ---
export let brushBase = 6;
export const SPEED_FACTOR = 0.008;
export let recordedStrokes = [];
export let currentStroke = null;
export let isDrawing = false;
export let strokeStartTime = 0;
export let debounceTimer = null;

// --- Animation state ---
export let replayTimeline = null;
export let replayStartTime = null;
export let animationActive = false;
export let strokeBounds = null;

// --- Setters (modules can't reassign imported bindings) ---
export function setDOMRefs(refs) {
    videoEl = refs.videoEl;
    outputCanvas = refs.outputCanvas;
    drawingCanvas = refs.drawingCanvas;
    statusEl = refs.statusEl;
    errorOverlay = refs.errorOverlay;
    brushSlider = refs.brushSlider;
    brushValEl = refs.brushValEl;
    outCtx = refs.outputCanvas.getContext('2d');
    drawCtx = refs.drawingCanvas.getContext('2d');
}

export function setBrushBase(v) { brushBase = v; }
export function setRecordedStrokes(v) { recordedStrokes = v; }
export function setCurrentStroke(v) { currentStroke = v; }
export function setIsDrawing(v) { isDrawing = v; }
export function setStrokeStartTime(v) { strokeStartTime = v; }
export function setDebounceTimer(v) { debounceTimer = v; }
export function setReplayTimeline(v) { replayTimeline = v; }
export function setReplayStartTime(v) { replayStartTime = v; }
export function setAnimationActive(v) { animationActive = v; }
export function setStrokeBounds(v) { strokeBounds = v; }
export function pushStroke(stroke) { recordedStrokes.push(stroke); }

// --- Helpers ---
export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function canvasCoords(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left) * (canvas.width / rect.width),
        y: (e.clientY - rect.top) * (canvas.height / rect.height)
    };
}

export function showError(msg) {
    errorOverlay.textContent = msg;
    errorOverlay.style.display = 'flex';
}
