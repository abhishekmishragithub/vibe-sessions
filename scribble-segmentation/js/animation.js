// Replay timeline, tiled scribble rendering

import {
    recordedStrokes, replayTimeline, replayStartTime, strokeBounds,
    animationActive, scribbleCtx, tileCanvas, tileCtx,
    setReplayTimeline, setReplayStartTime, setAnimationActive, setStrokeBounds,
    statusEl
} from './state.js';

// --- Compute bounding box of all strokes ---
function getStrokeBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const stroke of recordedStrokes) {
        for (const pt of stroke.points) {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        }
    }
    const pad = 30;
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(1920, maxX + pad);
    maxY = Math.min(1080, maxY + pad);
    return { x: minX, y: minY, w: Math.max(50, maxX - minX), h: Math.max(50, maxY - minY) };
}

// --- Build replay timeline from strokes ---
function buildReplayTimeline(strokes) {
    const GAP = 200;
    const timeline = [];
    let offset = 0;
    for (const stroke of strokes) {
        for (let i = 0; i < stroke.points.length; i++) {
            const pt = stroke.points[i];
            timeline.push({ x: pt.x, y: pt.y, t: pt.t + offset, w: pt.w, isFirst: i === 0 });
        }
        offset += stroke.points[stroke.points.length - 1].t + GAP;
    }
    timeline.totalDuration = offset - GAP;
    return timeline;
}

// --- Start animation ---
export function startAnimation() {
    if (recordedStrokes.length === 0) return;
    setReplayTimeline(buildReplayTimeline(recordedStrokes));
    setStrokeBounds(getStrokeBounds());
    setReplayStartTime(performance.now());
    setAnimationActive(true);
    statusEl.textContent = 'Animating scribble on person mask\u2026';
}

// --- Draw strokes onto tile canvas (offset to bounding box) ---
function drawStrokesOnTile(ctx, bounds, maxTime) {
    ctx.strokeStyle = '#000';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < replayTimeline.length; i++) {
        const pt = replayTimeline[i];
        if (maxTime !== null && pt.t > maxTime) break;

        const tx = pt.x - bounds.x;
        const ty = pt.y - bounds.y;

        if (pt.isFirst) {
            ctx.beginPath();
            ctx.moveTo(tx, ty);
        } else {
            ctx.lineWidth = pt.w;
            ctx.lineTo(tx, ty);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(tx, ty);
        }
    }
}

// --- Render tiled scribble pattern ---
function renderTiledScribble(maxTime) {
    const b = strokeBounds;
    tileCanvas.width = b.w;
    tileCanvas.height = b.h;
    tileCtx.clearRect(0, 0, b.w, b.h);
    drawStrokesOnTile(tileCtx, b, maxTime);

    scribbleCtx.clearRect(0, 0, 1280, 720);
    scribbleCtx.save();
    const sx = 1280 / 1920;
    const sy = 720 / 1080;
    scribbleCtx.scale(sx, sy);
    const pattern = scribbleCtx.createPattern(tileCanvas, 'repeat');
    scribbleCtx.fillStyle = pattern;
    scribbleCtx.fillRect(0, 0, 1920, 1080);
    scribbleCtx.restore();
}

// --- Render one animation frame ---
export function renderScribbleFrame() {
    if (!animationActive || !replayTimeline || replayTimeline.length === 0 || !strokeBounds) return;

    const elapsed = performance.now() - replayStartTime;
    const dur = replayTimeline.totalDuration;
    if (dur <= 0) { renderTiledScribble(null); return; }

    const loopLen = dur + 500;
    const currentTime = elapsed % loopLen;

    renderTiledScribble(currentTime > dur ? null : currentTime);
}
