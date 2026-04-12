const SEGMENTS = {
    '0': [1,1,1,1,1,1,0], '1': [0,0,1,0,0,1,0], '2': [1,0,1,1,1,0,1], '3': [1,0,1,1,0,1,1],
    '4': [0,1,1,0,0,1,1], '5': [1,1,0,1,0,1,1], '6': [1,1,0,1,1,1,1], '7': [1,0,1,0,0,1,0],
    '8': [1,1,1,1,1,1,1], '9': [1,1,1,1,0,1,1], 'A': [1,1,1,0,1,1,1], 'B': [0,1,1,1,1,1,1],
    'C': [1,1,0,1,1,0,0], 'D': [0,0,1,1,1,1,1], 'E': [1,1,0,1,1,0,1], 'F': [1,1,0,0,1,0,1],
    'G': [1,1,0,1,1,1,0], 'H': [0,1,1,0,1,1,1], 'I': [0,0,1,0,0,1,0], 'J': [0,0,1,1,1,0,0],
    'L': [0,1,0,1,1,0,0], 'O': [1,1,1,1,1,1,0], 'P': [1,1,1,0,1,0,1], 'R': [1,1,1,0,1,0,0],
    'S': [1,1,0,1,0,1,1], 'U': [0,1,1,1,1,1,0], 'T': [0,1,1,1,0,0,1], ' ': [0,0,0,0,0,0,0],
    '-': [0,0,0,0,0,0,1], '.': [0,0,0,0,0,0,0]
};

// Map indices to normalized segment coordinates [x1, y1, x2, y2]
// 0: top, 1: top-left, 2: top-right, 3: bottom, 4: bottom-left, 5: bottom-right, 6: middle
const SEGMENT_MAP = [
    [0.1, 0, 0.9, 0],       // 0: top
    [0, 0.05, 0, 0.45],    // 1: top-left
    [1, 0.05, 1, 0.45],    // 2: top-right
    [0.1, 1, 0.9, 1],       // 3: bottom
    [0, 0.55, 0, 0.95],    // 4: bottom-left
    [1, 0.55, 1, 0.95],    // 5: bottom-right
    [0.1, 0.5, 0.9, 0.5]    // 6: middle
];

const canvas = document.getElementById('weaveCanvas');
const ctx = canvas.getContext('2d');
const textInput = document.getElementById('textInput');
const colorActive = document.getElementById('colorActive');
const colorDim = document.getElementById('colorDim');
const gridScale = document.getElementById('gridScale');
const extrusionInt = document.getElementById('extrusionInt');
const downloadBtn = document.getElementById('downloadBtn');

let mouseX = 0, mouseY = 0;

function init() {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);

    [textInput, colorActive, colorDim, gridScale, extrusionInt].forEach(el => {
        el.addEventListener('input', updateLabels);
    });

    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left);
        mouseY = (e.clientY - rect.top);
    });

    downloadBtn.addEventListener('click', downloadCanvas);
    
    updateLabels();
    requestAnimationFrame(loop);
}

function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
}

function updateLabels() {
    document.getElementById('gridScaleVal').textContent = gridScale.value;
    document.getElementById('extrusionIntVal').textContent = extrusionInt.value;
    document.getElementById('colorActiveHex').textContent = colorActive.value.toUpperCase();
    document.getElementById('colorDimHex').textContent = colorDim.value.toUpperCase();
}

function loop() {
    render();
    requestAnimationFrame(loop);
}

function render() {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

    const text = textInput.value || " ";
    const scale = parseInt(gridScale.value);
    const charW = scale;
    const charH = scale * 1.6;
    const gap = scale * 0.6;
    const extDepth = parseInt(extrusionInt.value);

    const cols = Math.ceil((canvas.width / (window.devicePixelRatio || 1)) / (charW + gap)) + 1;
    const rows = Math.ceil((canvas.height / (window.devicePixelRatio || 1)) / (charH + gap)) + 1;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const charIdx = (r * cols + c) % text.length;
            const char = text[charIdx].toUpperCase();
            const segData = SEGMENTS[char] || SEGMENTS[' '];

            const x = c * (charW + gap);
            const y = r * (charH + gap);

            drawCharacter(char, segData, x, y, charW, charH, extDepth);
        }
    }
}

function getSlantedX(x, y, charY, h) {
    const slant = 0.15; // Digital-7 style slant
    return x + (charY + h - y) * slant;
}

function drawCharacter(char, segData, x, y, w, h, extDepth) {
    segData.forEach((active, i) => {
        const coords = SEGMENT_MAP[i];
        
        // Calculate points with slant
        const x1 = getSlantedX(x + coords[0] * w, y + coords[1] * h, y, h);
        const y1 = y + coords[1] * h;
        const x2 = getSlantedX(x + coords[2] * w, y + coords[3] * h, y, h);
        const y2 = y + coords[3] * h;

        // Calculate extrusion based on proximity to mouse
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dist = Math.sqrt((midX - mouseX)**2 + (midY - mouseY)**2);
        const pushRadius = 250;
        const extrusion = Math.max(0, (1 - dist / pushRadius)) * extDepth;

        // Perspective projection
        const p1 = project(x1, y1, extrusion);
        const p2 = project(x2, y2, extrusion);

        // Draw background segment (dim)
        ctx.strokeStyle = active ? colorActive.value : colorDim.value;
        ctx.lineWidth = active ? 4 : 1;
        ctx.lineCap = 'butt'; // Digital-7 has flat segment ends

        if (active && extrusion > 0) {
            // Draw extrusion sides (the "3D" part)
            ctx.fillStyle = colorActive.value;
            ctx.globalAlpha = 0.2;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(x2, y2);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1.0;
            
            // Draw front face segment
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
            
            // Add a highlight on the front face
            ctx.strokeStyle = '#fff';
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        } else {
            // Static flat segment
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
    });
}

function project(x, y, z) {
    const fov = 1000;
    const scale = fov / (fov - z);
    // Use the mouse position as the projection center for more dynamic effect
    // Or keep it fixed at center. Let's try fixed first for stability.
    const cx = canvas.width / (2 * (window.devicePixelRatio || 1));
    const cy = canvas.height / (2 * (window.devicePixelRatio || 1));
    
    return {
        x: (x - cx) * scale + cx,
        y: (y - cy) * scale + cy
    };
}

function downloadCanvas() {
    const link = document.createElement('a');
    link.download = `digital7-weave-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

init();
