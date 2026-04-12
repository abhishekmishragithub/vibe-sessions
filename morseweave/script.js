const MORSE_CODE = {
    'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
    'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
    'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
    'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
    'Y': '-.--', 'Z': '--..', '1': '.----', '2': '..---', '3': '...--',
    '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..',
    '9': '----.', '0': '-----', ' ': '/'
};

// Physics Constants - Tuned for flowy fabric
const GRAVITY = 0.02;
const FRICTION = 0.98;
const STIFFNESS = 0.8;

class Point {
    constructor(x, y, z) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.oldX = x;
        this.oldY = y;
        this.oldZ = z;
        this.pinned = false;
    }

    update() {
        if (this.pinned) return;
        let vx = (this.x - this.oldX) * FRICTION;
        let vy = (this.y - this.oldY) * FRICTION;
        let vz = (this.z - this.oldZ) * FRICTION;

        this.oldX = this.x;
        this.oldY = this.y;
        this.oldZ = this.z;

        this.x += vx;
        this.y += vy + GRAVITY;
        this.z += vz;
    }
}

class Stick {
    constructor(p1, p2, length) {
        this.p1 = p1;
        this.p2 = p2;
        this.length = length;
    }

    update() {
        let dx = this.p2.x - this.p1.x;
        let dy = this.p2.y - this.p1.y;
        let dz = this.p2.z - this.p1.z;
        let distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let difference = (this.length - distance) / distance;
        
        let offsetX = dx * difference * 0.5 * STIFFNESS;
        let offsetY = dy * difference * 0.5 * STIFFNESS;
        let offsetZ = dz * difference * 0.5 * STIFFNESS;

        if (!this.p1.pinned) {
            this.p1.x -= offsetX;
            this.p1.y -= offsetY;
            this.p1.z -= offsetZ;
        }
        if (!this.p2.pinned) {
            this.p2.x += offsetX;
            this.p2.y += offsetY;
            this.p2.z += offsetZ;
        }
    }
}

const canvas = document.getElementById('weaveCanvas');
const ctx = canvas.getContext('2d');
const textInput = document.getElementById('textInput');
const colorDash = document.getElementById('colorDash');
const colorDot = document.getElementById('colorDot');
const repeatX = document.getElementById('repeatX');
const repeatY = document.getElementById('repeatY');
const tileSizeInput = document.getElementById('tileSize');
const windIntensityInput = document.getElementById('windIntensity');
const downloadBtn = document.getElementById('downloadBtn');
const nodeCountDisplay = document.getElementById('nodeCount');
const windSpeedDisplay = document.getElementById('windSpeed');
const clockDisplay = document.getElementById('clockDisplay');
const windViz = document.getElementById('windViz');

let points = [];
let sticks = [];
let morseGrid = [];
let gridW = 0, gridH = 0;
let mouseX = 0, mouseY = 0, lastMouseX = 0, lastMouseY = 0;
let windX = 0, windY = 0;

// Viewport State
let rotX = 0;
let rotY = 0;
let zoom = 1200; // Camera distance
let isRightDragging = false;

// UI State
const barCount = 20;
const bars = [];

function init() {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    
    // Create wind bars
    for (let i = 0; i < barCount; i++) {
        const bar = document.createElement('div');
        bar.className = 'wind-bar';
        windViz.appendChild(bar);
        bars.push(bar);
    }

    [textInput, colorDash, colorDot, repeatX, repeatY, tileSizeInput, windIntensityInput].forEach(el => {
        el.addEventListener('input', () => {
            updateLabels();
            if (el.id !== 'windIntensity') resetCloth();
        });
    });

    canvas.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        const curX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const curY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        if (isRightDragging) {
            rotY += (e.clientX - lastMouseRawX) * 0.01;
            rotX -= (e.clientY - lastMouseRawY) * 0.01;
        } else {
            windX = (curX - mouseX) * 0.05; 
            windY = (curY - mouseY) * 0.05;
        }
        
        mouseX = curX;
        mouseY = curY;
        lastMouseRawX = e.clientX;
        lastMouseRawY = e.clientY;
    });

    canvas.addEventListener('wheel', e => {
        zoom += e.deltaY * 0.5;
        zoom = Math.max(200, Math.min(3000, zoom));
        e.preventDefault();
    }, { passive: false });

    let lastMouseRawX = 0;
    let lastMouseRawY = 0;

    canvas.addEventListener('mousedown', e => {
        if (e.button === 2) {
            isRightDragging = true;
            lastMouseRawX = e.clientX;
            lastMouseRawY = e.clientY;
            e.preventDefault();
        }
    });

    window.addEventListener('mouseup', () => {
        isRightDragging = false;
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    downloadBtn.addEventListener('click', downloadCanvas);
    
    updateLabels();
    resetCloth();
    requestAnimationFrame(loop);
    
    setInterval(() => {
        const now = new Date();
        clockDisplay.textContent = now.toTimeString().split(' ')[0];
    }, 1000);
}

function setupCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentNode.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
}

function updateLabels() {
    document.getElementById('repeatXVal').textContent = repeatX.value;
    document.getElementById('repeatYVal').textContent = repeatY.value;
    document.getElementById('tileSizeVal').textContent = tileSizeInput.value;
    document.getElementById('windIntensityVal').textContent = windIntensityInput.value;
    document.getElementById('colorDashHex').textContent = colorDash.value.toUpperCase();
    document.getElementById('colorDotHex').textContent = colorDot.value.toUpperCase();
}

function textToMorse(text) {
    return text.toUpperCase().split('').map(char => MORSE_CODE[char] || '').join('').replace(/\//g, '');
}

function resetCloth() {
    points = [];
    sticks = [];
    morseGrid = [];

    const text = textInput.value;
    const morse = textToMorse(text) || '.';
    const rx = parseInt(repeatX.value);
    const ry = parseInt(repeatY.value);
    const ts = parseInt(tileSizeInput.value);

    const unitSide = Math.ceil(Math.sqrt(morse.length));
    gridW = unitSide * rx;
    gridH = unitSide * ry;

    for (let y = 0; y < gridH; y++) {
        morseGrid[y] = [];
        for (let x = 0; x < gridW; x++) {
            const unitX = x % unitSide;
            const unitY = y % unitSide;
            const morseIdx = unitY * unitSide + unitX;
            morseGrid[y][x] = morse[morseIdx % morse.length];
        }
    }

    for (let y = 0; y <= gridH; y++) {
        for (let x = 0; x <= gridW; x++) {
            const pX = (x - gridW / 2) * ts;
            const pY = 0;
            const pZ = (y - gridH / 2) * ts;
            
            const p = new Point(pX, pY, pZ);
            
            // Anchor all 4 sides
            if (x === 0 || x === gridW || y === 0 || y === gridH) {
                p.pinned = true;
            }
            
            points.push(p);
        }
    }

    for (let y = 0; y <= gridH; y++) {
        for (let x = 0; x <= gridW; x++) {
            if (x < gridW) sticks.push(new Stick(points[y * (gridW + 1) + x], points[y * (gridW + 1) + x + 1], ts));
            if (y < gridH) sticks.push(new Stick(points[y * (gridW + 1) + x], points[(y + 1) * (gridW + 1) + x], ts));
        }
    }

    nodeCountDisplay.textContent = points.length;
}

function project(p) {
    const cw = (canvas.width / (window.devicePixelRatio || 1));
    const ch = (canvas.height / (window.devicePixelRatio || 1));
    
    // Rotate point
    let x = p.x;
    let y = p.y;
    let z = p.z;

    // Y-axis rotation
    let cosRY = Math.cos(rotY);
    let sinRY = Math.sin(rotY);
    let tempZ = z * cosRY - x * sinRY;
    let tempX = z * sinRY + x * cosRY;
    x = tempX;
    z = tempZ;

    // X-axis rotation
    let cosRX = Math.cos(rotX);
    let sinRX = Math.sin(rotX);
    let tempY = y * cosRX - z * sinRX;
    tempZ = y * sinRX + z * cosRX;
    y = tempY;
    z = tempZ;

    const horizonY = ch * 0.6; 
    const fov = 800;
    const scale = fov / (z + zoom);
    
    return {
        x: cw / 2 + x * scale,
        y: horizonY + y * scale,
        scale: scale
    };
}

function loop() {
    updatePhysics();
    updateUI();
    render();
    requestAnimationFrame(loop);
}

function updatePhysics() {
    const currentWindSpeed = Math.sqrt(windX * windX + windY * windY);
    windSpeedDisplay.textContent = currentWindSpeed.toFixed(2);

    const intensity = parseInt(windIntensityInput.value) / 50; // Scale 0-2

    points.forEach(p => {
        if (!p.pinned) {
            const dx = p.x - (mouseX - (canvas.width/(window.devicePixelRatio||1))/2);
            const dy = p.y - (mouseY - (canvas.height/(window.devicePixelRatio||1))/2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 150) {
                const force = (150 - dist) / 150;
                p.x += windX * force * intensity * 5;
                p.y += windY * force * intensity * 5;
                p.z += (Math.random() - 0.5) * intensity;
            }
        }
        p.update();
    });

    for (let i = 0; i < 5; i++) {
        sticks.forEach(s => s.update());
    }

    windX *= 0.92;
    windY *= 0.92;
}

function updateUI() {
    const speed = Math.sqrt(windX * windX + windY * windY) * 10;
    bars.forEach((bar, i) => {
        const targetH = Math.min(20, Math.random() * speed + 2);
        bar.style.height = `${targetH}px`;
        if (speed > 1) bar.classList.add('active');
        else bar.classList.remove('active');
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cDash = colorDash.value;
    const cDot = colorDot.value;

    for (let y = 0; y < gridH; y++) {
        for (let x = 0; x < gridW; x++) {
            const char = morseGrid[y][x];
            const p1 = project(points[y * (gridW + 1) + x]);
            
            if (char === '-') {
                const p2 = project(points[y * (gridW + 1) + x + 1]);
                ctx.lineWidth = 2 * p1.scale;
                ctx.strokeStyle = cDash;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            } else {
                const p2 = project(points[(y + 1) * (gridW + 1) + x]);
                ctx.lineWidth = 2 * p1.scale;
                ctx.strokeStyle = cDot;
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        }
    }
}

function downloadCanvas() {
    const link = document.createElement('a');
    link.download = `morse-flow-fabric-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

init();
