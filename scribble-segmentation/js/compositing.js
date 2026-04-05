// Alpha mask conversion and per-frame compositing pipeline

import {
    outCtx, maskCtx, scribbleCanvas, alphaMaskCanvas, alphaMaskCtx,
    animationActive, replayTimeline, strokeBounds
} from './state.js';
import { renderScribbleFrame } from './animation.js';

// --- Convert segmentation mask luminance to alpha ---
function buildAlphaMask(segMask) {
    alphaMaskCtx.clearRect(0, 0, 1280, 720);
    alphaMaskCtx.drawImage(segMask, 0, 0, 1280, 720);
    const imgData = alphaMaskCtx.getImageData(0, 0, 1280, 720);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
        d[i + 3] = d[i]; // alpha = red channel
        d[i] = d[i + 1] = d[i + 2] = 0;
    }
    alphaMaskCtx.putImageData(imgData, 0, 0);
}

// --- Main compositing callback for MediaPipe ---
export function onResults(results) {
    outCtx.save();
    outCtx.clearRect(0, 0, 1280, 720);

    buildAlphaMask(results.segmentationMask);

    if (animationActive && replayTimeline && strokeBounds) {
        // Render tiled scribble
        renderScribbleFrame();

        // Clip to person silhouette
        maskCtx.clearRect(0, 0, 1280, 720);
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.drawImage(alphaMaskCanvas, 0, 0);
        maskCtx.globalCompositeOperation = 'source-in';
        maskCtx.drawImage(scribbleCanvas, 0, 0);

        // Output: person filled with tiled scribble
        outCtx.drawImage(maskCtx.canvas, 0, 0);
    } else {
        // Black person silhouette on white bg
        outCtx.drawImage(alphaMaskCanvas, 0, 0);
        outCtx.globalCompositeOperation = 'source-in';
        outCtx.fillStyle = '#000';
        outCtx.fillRect(0, 0, 1280, 720);
    }

    outCtx.restore();
}
