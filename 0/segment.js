const videoElement = document.getElementById('input-video');
const outputCanvas = document.getElementById('output-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const ctxOutput = outputCanvas.getContext('2d');
const ctxDraw = drawCanvas.getContext('2d');
const startBtn = document.getElementById('start-btn');
const statusMsg = document.getElementById('status-msg');

let selfieSegmentation;
let camera;
let strokes = []; // Array of {points: [{x, y, vx, vy}], timestamp}
let currentStroke = null;
let isDrawing = false;
let personCentroid = { x: 460, y: 540 }; // Initial center (920/2, 1080/2)
let lastMousePos = { x: 0, y: 0 };
let startTime = Date.now();

// 1. Initialize Segmentation
function onResults(results) {
    // 1. Clear with White Background
    ctxOutput.fillStyle = 'white';
    ctxOutput.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
    
    // Process results to find centroid of the person
    updateCentroid(results.segmentationMask);

    // 2. Draw Black Person Silhouette
    ctxOutput.save();
    
    // Set globalCompositeOperation to draw the person
    // We want to fill the mask area with black
    ctxOutput.globalCompositeOperation = 'destination-out'; 
    // destination-out will "punch a hole" in the white background where the mask is
    ctxOutput.drawImage(results.segmentationMask, 0, 0, outputCanvas.width, outputCanvas.height);
    
    // Now we have a hole. We want it black. 
    // Since destination-out makes it transparent, we can just put a black layer behind it 
    // OR we can use source-in on a temporary black fill.
    
    // Let's use a cleaner approach:
    ctxOutput.restore();
    
    // Alternative: 
    // 1. Fill white (done)
    // 2. Draw mask
    // 3. Composite black over mask
    
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = outputCanvas.width;
    tempCanvas.height = outputCanvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw mask to temp
    tempCtx.drawImage(results.segmentationMask, 0, 0, tempCanvas.width, tempCanvas.height);
    
    // Fill with black where mask is
    tempCtx.globalCompositeOperation = 'source-in';
    tempCtx.fillStyle = 'black';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
    
    // Draw temp onto main
    ctxOutput.drawImage(tempCanvas, 0, 0);

    // Render drawings (scribbles)
    renderScribbles();
}

function updateCentroid(mask) {
    // Create a temporary canvas to read mask pixels
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 100; // Low res for performance
    tempCanvas.height = 100;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(mask, 0, 0, 100, 100);
    const data = tempCtx.getImageData(0, 0, 100, 100).data;

    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3]; // Mask is usually in alpha or red channel
        if (alpha > 128) {
            const pixelIndex = i / 4;
            const x = pixelIndex % 100;
            const y = Math.floor(pixelIndex / 100);
            sumX += x;
            sumY += y;
            count++;
        }
    }

    if (count > 0) {
        // Smooth transition for centroid
        const targetX = (sumX / count) * (outputCanvas.width / 100);
        const targetY = (sumY / count) * (outputCanvas.height / 100);
        personCentroid.x += (targetX - personCentroid.x) * 0.1;
        personCentroid.y += (targetY - personCentroid.y) * 0.1;
    }
}

function renderScribbles() {
    ctxDraw.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
    
    const elapsed = (Date.now() - startTime) / 1000;
    
    strokes.forEach(stroke => {
        ctxDraw.beginPath();
        ctxDraw.strokeStyle = 'black';
        ctxDraw.lineWidth = 3;
        ctxDraw.lineJoin = 'round';
        ctxDraw.lineCap = 'round';

        stroke.points.forEach((p, index) => {
            // Animate: add a small oscillatory offset based on time
            const phase = elapsed * 5 + index * 0.1;
            const animX = Math.sin(phase) * 2;
            const animY = Math.cos(phase) * 2;

            // Calculate current position: relative offset + current centroid
            const x = personCentroid.x + p.relX + animX;
            const y = personCentroid.y + p.relY + animY;

            if (index === 0) ctxDraw.moveTo(x, y);
            else ctxDraw.lineTo(x, y);
        });
        ctxDraw.stroke();
    });
}

// 2. Drawing Interaction
drawCanvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Only left click
    isDrawing = true;
    currentStroke = { points: [] };
    lastMousePos = getMousePos(e);
    addPointToStroke(lastMousePos, true);
});

window.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const pos = getMousePos(e);
    addPointToStroke(pos, false);
    lastMousePos = pos;
});

window.addEventListener('mouseup', () => {
    if (isDrawing) {
        strokes.push(currentStroke);
        isDrawing = false;
        currentStroke = null;
    }
});

drawCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    strokes = [];
    ctxDraw.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
});

function getMousePos(e) {
    const rect = drawCanvas.getBoundingClientRect();
    const scaleX = drawCanvas.width / rect.width;
    const scaleY = drawCanvas.height / rect.height;
    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

function addPointToStroke(pos, isStart) {
    // Store point relative to the person's current centroid
    const relX = pos.x - personCentroid.x;
    const relY = pos.y - personCentroid.y;
    
    currentStroke.points.push({
        relX: relX,
        relY: relY
    });
}

// 3. Camera Setup
async function startCamera() {
    statusMsg.innerText = "Initializing MediaPipe...";
    
    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`;
        }
    });

    selfieSegmentation.setOptions({
        modelSelection: 1, // 0 for general, 1 for landscape/faster
    });

    selfieSegmentation.onResults(onResults);

    camera = new Camera(videoElement, {
        onFrame: async () => {
            await selfieSegmentation.send({ image: videoElement });
        },
        width: 920,
        height: 1080
    });

    try {
        await camera.start();
        statusMsg.innerText = "Camera active. Start drawing!";
        startBtn.style.display = 'none';
    } catch (err) {
        statusMsg.innerText = "Error accessing camera: " + err.message;
    }
}

startBtn.addEventListener('click', startCamera);
