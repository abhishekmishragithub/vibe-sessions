// Stroke recording and mouse event handlers

import {
    drawingCanvas, drawCtx, brushBase, SPEED_FACTOR,
    currentStroke, isDrawing, strokeStartTime, debounceTimer,
    recordedStrokes,
    setCurrentStroke, setIsDrawing, setStrokeStartTime, setDebounceTimer,
    pushStroke, setRecordedStrokes, setAnimationActive, setReplayTimeline,
    setReplayStartTime, setStrokeBounds, statusEl,
    clamp, canvasCoords
} from './state.js';
import { startAnimation } from './animation.js';

export function initDrawing() {
    // Init drawing canvas to white
    drawCtx.fillStyle = '#ffffff';
    drawCtx.fillRect(0, 0, 1920, 1080);

    drawingCanvas.addEventListener('mousedown', onMouseDown);
    drawingCanvas.addEventListener('mousemove', onMouseMove);
    drawingCanvas.addEventListener('mouseup', onMouseUp);
    drawingCanvas.addEventListener('mouseleave', onMouseLeave);
    drawingCanvas.addEventListener('contextmenu', onRightClick);
}

function onMouseDown(e) {
    if (e.button !== 0) return;
    setIsDrawing(true);
    const { x, y } = canvasCoords(e, drawingCanvas);
    setStrokeStartTime(performance.now());
    setCurrentStroke({ points: [{ x, y, t: 0, w: brushBase }] });

    drawCtx.beginPath();
    drawCtx.arc(x, y, brushBase / 2, 0, Math.PI * 2);
    drawCtx.fillStyle = '#000';
    drawCtx.fill();
}

function onMouseMove(e) {
    if (!isDrawing || !currentStroke) return;
    const { x, y } = canvasCoords(e, drawingCanvas);
    const t = performance.now() - strokeStartTime;
    const prev = currentStroke.points[currentStroke.points.length - 1];
    const dx = x - prev.x;
    const dy = y - prev.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dt = t - prev.t;
    const speed = dt > 0 ? dist / dt : 0;
    const minW = Math.max(1, brushBase * 0.25);
    const w = clamp(brushBase - speed * SPEED_FACTOR * brushBase, minW, brushBase);

    currentStroke.points.push({ x, y, t, w });

    drawCtx.beginPath();
    drawCtx.moveTo(prev.x, prev.y);
    drawCtx.lineTo(x, y);
    drawCtx.strokeStyle = '#000';
    drawCtx.lineWidth = w;
    drawCtx.lineCap = 'round';
    drawCtx.lineJoin = 'round';
    drawCtx.stroke();
}

function finishStroke() {
    if (!currentStroke || currentStroke.points.length < 2) {
        setCurrentStroke(null);
        return;
    }
    pushStroke(currentStroke);
    setCurrentStroke(null);
    clearTimeout(debounceTimer);
    setDebounceTimer(setTimeout(startAnimation, 500));
}

function onMouseUp(e) {
    if (e.button !== 0) return;
    setIsDrawing(false);
    finishStroke();
}

function onMouseLeave() {
    if (isDrawing) {
        setIsDrawing(false);
        finishStroke();
    }
}

function onRightClick(e) {
    e.preventDefault();
    drawCtx.fillStyle = '#ffffff';
    drawCtx.fillRect(0, 0, 1920, 1080);
    setRecordedStrokes([]);
    setCurrentStroke(null);
    setAnimationActive(false);
    setReplayTimeline(null);
    setReplayStartTime(null);
    setStrokeBounds(null);
    clearTimeout(debounceTimer);
    setDebounceTimer(null);
    statusEl.textContent = 'Cleared. Draw again!';
}
