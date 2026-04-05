// Main entry point — init MediaPipe, Camera, wire modules together

import { setDOMRefs, setBrushBase, showError } from './state.js';
import { initDrawing } from './drawing.js';
import { onResults } from './compositing.js';

async function init() {
    const refs = {
        videoEl: document.getElementById('webcam'),
        outputCanvas: document.getElementById('output'),
        drawingCanvas: document.getElementById('drawing'),
        statusEl: document.getElementById('status'),
        errorOverlay: document.getElementById('error-overlay'),
        brushSlider: document.getElementById('brushSize'),
        brushValEl: document.getElementById('brushVal')
    };

    setDOMRefs(refs);

    // Brush slider
    refs.brushSlider.addEventListener('input', () => {
        const v = parseInt(refs.brushSlider.value);
        setBrushBase(v);
        refs.brushValEl.textContent = v + 'px';
    });

    // Init drawing handlers
    initDrawing();

    refs.statusEl.textContent = 'Loading segmentation model\u2026';

    try {
        const selfieSegmentation = new SelfieSegmentation({
            locateFile: (file) =>
                `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
        });

        selfieSegmentation.setOptions({ modelSelection: 1, selfieMode: true });
        selfieSegmentation.onResults(onResults);

        refs.statusEl.textContent = 'Requesting camera access\u2026';

        const camera = new Camera(refs.videoEl, {
            onFrame: async () => {
                await selfieSegmentation.send({ image: refs.videoEl });
            },
            width: 1280,
            height: 720
        });

        await camera.start();
        refs.statusEl.textContent = 'Running \u2014 draw on the right canvas!';

    } catch (err) {
        console.error(err);
        if (err.name === 'NotAllowedError') {
            showError('Camera access denied. Please allow camera access and reload.');
        } else {
            showError('Failed to initialize: ' + err.message);
        }
    }
}

document.addEventListener('DOMContentLoaded', init);
