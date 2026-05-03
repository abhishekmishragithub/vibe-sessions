const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const startOverlay = document.getElementById('start-overlay');

// UI Elements
const deathProxInput = document.getElementById('death-proximity');
const deathRateSlider = document.getElementById('death-rate');
const deathRateVal = document.getElementById('death-rate-val');
const reproRateSlider = document.getElementById('repro-rate');
const reproRateVal = document.getElementById('repro-rate-val');
const angleChecks = document.querySelectorAll('.angle-check');
const clearBtn = document.getElementById('clear-btn');
const exportBtn = document.getElementById('export-btn');

// Stats Elements
const statWorms = document.getElementById('stat-worms');
const statPixels = document.getElementById('stat-pixels');
const statTicks = document.getElementById('stat-ticks');
const statFps = document.getElementById('stat-fps');

// Simulation Constants
const WIDTH = 540;
const HEIGHT = 400;
const GRID_STEP = 1; 
const GROWTH_INTERVAL = 5; 

// State
let worms = [];
let isRunning = false;
let ticks = 0;
let lastTime = 0;
let frameCount = 0;
let fps = 0;

deathRateSlider.addEventListener('input', () => deathRateVal.textContent = deathRateSlider.value);
reproRateSlider.addEventListener('input', () => reproRateVal.textContent = reproRateSlider.value);

class Worm {
    constructor(x, y) {
        this.segments = [{ x: x, y: y }];
        this.distanceMoved = 0;
        this.isDead = false;
        this.headColor = '#000000';
        this.tailColor = '#0f380f';
    }

    getRandomAllowedAngle() {
        const allowed = Array.from(angleChecks)
            .filter(c => c.checked)
            .map(c => parseInt(c.value));
        if (allowed.length === 0) return Math.floor(Math.random() * 8) * 45;
        return allowed[Math.floor(Math.random() * allowed.length)];
    }

    update() {
        if (this.isDead) return;

        const currentAngle = this.getRandomAllowedAngle();
        const head = this.segments[0];
        const jitter = (Math.random() - 0.5) * 0.2; 
        const rad = (currentAngle * Math.PI) / 180;
        
        const vx = Math.cos(rad + jitter) * GRID_STEP;
        const vy = Math.sin(rad + jitter) * GRID_STEP;

        let nx = head.x + vx;
        let ny = head.y + vy;

        // Ricochet Logic
        if (nx < 0 || nx >= WIDTH) {
            nx = head.x - vx; 
        }
        if (ny < 0 || ny >= HEIGHT) {
            ny = head.y - vy; 
        }

        const newHead = { x: nx, y: ny };
        this.segments.unshift(newHead);
        this.distanceMoved += GRID_STEP;

        if (this.distanceMoved < GROWTH_INTERVAL) {
            this.segments.pop();
        } else {
            this.distanceMoved = 0;
        }

        const reproRate = parseFloat(reproRateSlider.value);
        if (Math.random() * 1000 < reproRate * 3) {
            this.reproduce();
        }

        this.checkDeath();
    }

    checkDeath() {
        const head = this.segments[0];
        const deathProx = parseInt(deathProxInput.value);
        const deathRate = parseFloat(deathRateSlider.value);

        if (deathRate === 0) return;

        for (let other of worms) {
            if (other === this) continue;
            const otherHead = other.segments[0];
            const dist = Math.hypot(head.x - otherHead.x, head.y - otherHead.y);
            
            if (dist < deathProx) {
                if (Math.random() * 100 < deathRate) {
                    this.isDead = true;
                    return;
                }
            }
        }
    }

    reproduce() {
        const head = this.segments[0];
        const newWorm = new Worm(head.x, head.y);
        worms.push(newWorm);
    }

    draw(renderCtx) {
        const len = this.segments.length;
        this.segments.forEach((seg, i) => {
            const ratio = i / len;
            renderCtx.fillStyle = this.getGradientColor(ratio);
            renderCtx.fillRect(Math.floor(seg.x), Math.floor(seg.y), 1, 1);
        });
    }

    getGradientColor(ratio) {
        const c1 = { r: 0, g: 0, b: 0 }; 
        const c2 = { r: 15, g: 56, b: 15 }; 
        const r = Math.floor(c1.r + (c2.r - c1.r) * ratio);
        const g = Math.floor(c1.g + (c2.g - c1.g) * ratio);
        const b = Math.floor(c1.b + (c2.b - c1.b) * ratio);
        return `rgb(${r},${g},${b})`;
    }
}

function startSim(e) {
    if (!isRunning) {
        isRunning = true;
        startOverlay.classList.add('hidden');
        initCanvas();
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const scaleY = HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    worms.push(new Worm(x, y));
}

function initCanvas() {
    ctx.fillStyle = '#9bbc0f';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

clearBtn.addEventListener('click', () => {
    worms = [];
    ticks = 0;
    initCanvas();
    updateStats();
});

exportBtn.addEventListener('click', saveImage);

canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) startSim(e);
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (isRunning) saveImage();
});

function saveImage() {
    const link = document.createElement('a');
    link.download = `worm-nisha-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

function updateStats() {
    statWorms.textContent = worms.length;
    let pixels = worms.reduce((sum, w) => sum + w.segments.length, 0);
    statPixels.textContent = pixels;
    statTicks.textContent = ticks;
    statFps.textContent = fps;
}

function loop(timestamp) {
    if (isRunning) {
        // FPS calculation
        frameCount++;
        if (timestamp - lastTime >= 1000) {
            fps = frameCount;
            frameCount = 0;
            lastTime = timestamp;
        }

        ctx.fillStyle = 'rgba(155, 188, 15, 0.03)'; 
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        
        worms = worms.filter(w => !w.isDead);
        worms.forEach(w => {
            w.update();
            w.draw(ctx);
        });

        ticks++;
        updateStats();
    }
    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
