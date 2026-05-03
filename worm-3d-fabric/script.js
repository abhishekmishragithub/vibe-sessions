// WORM.3D-FABRIC — voxel pattern garden
// Algorithm ported from worm-sim/script.js: random allowed direction per step,
// jitter, ricochet on missing voxel, growth interval, scaled reproduction.
// Visualization: crisp wireframe shape edges + faint lattice + persistent
// painted-voxel layer that accumulates the pattern.

let container, scene, camera, renderer, controls;

const VOXEL = 0.3;            // voxel side length in world units (smaller = denser pixels)
const HALF_GRID = 10;         // grid half-extent in voxels (~21 cells across)
let userMaxLen = 8;           // worm length in cells (user-controlled, fixed — no growth)
// boundary safety margin — cells must be at least M deep inside the SDF so the
// rendered box doesn't poke past the wireframe edge
const M = VOXEL * 0.55;

// Torus knot params shared between SDF and visible geometry
const KNOT_R = 2.4;     // major radius
const KNOT_r = 0.7;     // tube center wave
const KNOT_TUBE = 0.85; // tube radius (filled volume around the curve)
const KNOT_p = 2;
const KNOT_q = 3;
let _knotCache = null;
function ensureKnotPoints() {
    if (_knotCache) return _knotCache;
    const N = 256;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const cu = Math.cos(KNOT_q * t), su = Math.sin(KNOT_q * t);
        const cv = Math.cos(KNOT_p * t), sv = Math.sin(KNOT_p * t);
        arr[i*3+0] = (KNOT_R + KNOT_r * cv) * cu;
        arr[i*3+1] = KNOT_r * sv;
        arr[i*3+2] = (KNOT_R + KNOT_r * cv) * su;
    }
    _knotCache = arr;
    return arr;
}

// ────────────────────────────────────────────────
// SHAPE TESTS — isInside(x,y,z) for each named geometry. Coordinates are in
// world units; the lattice walks integer voxel positions, so coords stay on a
// regular grid centered at origin.
// ────────────────────────────────────────────────
function isInside(x, y, z, type) {
    const r2 = x*x + y*y + z*z;
    const r  = Math.sqrt(r2);
    // every test is shrunk by M so the rendered voxel cube fits strictly inside the wireframe
    switch (type) {
        case 'cube':         return Math.abs(x) <= 3 - M && Math.abs(y) <= 3 - M && Math.abs(z) <= 3 - M;
        case 'sphere':       return r <= 3 - M;
        case 'cylinder':     return Math.abs(y) <= 3 - M && Math.hypot(x, z) <= 3 - M;
        case 'cone': {
            const h = 3, t = (h - y) / (2 * h);
            const rad = 3 * Math.max(0, Math.min(1, t));
            return Math.abs(y) <= h - M && Math.hypot(x, z) <= rad - M;
        }
        case 'donut': {
            const R = 2.2, rT = 1.0;
            return Math.hypot(Math.hypot(x, z) - R, y) <= rT - M;
        }
        case 'capsule': {
            const h = 1.5, rad = 1.8;
            const cy = Math.max(-h, Math.min(h, y));
            return Math.hypot(x, y - cy, z) <= rad - M;
        }
        case 'octahedron': return (Math.abs(x) + Math.abs(y) + Math.abs(z)) <= 3.5 - M;
        case 'tetrahedron':
            return Math.max(Math.abs(x + y) - z, Math.abs(x - y) + z) <= 3 - M;
        case 'pyramid': {
            const h = 3, t = (h - y) / (2 * h);
            const half = 3 * Math.max(0, Math.min(1, t));
            return Math.abs(y) <= h - M && Math.abs(x) <= half - M && Math.abs(z) <= half - M;
        }
        case 'hourglass': {
            const h = 3;
            const rad = 3 * Math.abs(y) / h;
            return Math.abs(y) <= h - M && Math.hypot(x, z) <= rad - M;
        }
        case 'knot': {
            // Distance from the parametric (p=2, q=3) torus knot curve, must be < tube radius
            const pts = ensureKnotPoints();
            let minD2 = Infinity;
            for (let i = 0; i < pts.length; i += 3) {
                const dx = x - pts[i], dy = y - pts[i+1], dz = z - pts[i+2];
                const d2 = dx*dx + dy*dy + dz*dz;
                if (d2 < minD2) minD2 = d2;
            }
            return Math.sqrt(minD2) <= KNOT_TUBE - M;
        }
        case 'plane': return Math.abs(y) <= 0.5 && Math.abs(x) <= 4 - M && Math.abs(z) <= 4 - M;
        default: return r <= 3 - M;
    }
}

// Build the matching Three.js geometry for the wireframe outline. Sized to
// match isInside() above so the boundary you see is the boundary worms hit.
function buildShapeGeometry(type) {
    switch (type) {
        case 'cube':         return new THREE.BoxGeometry(6, 6, 6);
        case 'sphere':       return new THREE.SphereGeometry(3, 32, 16);
        case 'cylinder':     return new THREE.CylinderGeometry(3, 3, 6, 32);
        case 'cone':         return new THREE.ConeGeometry(3, 6, 32);
        case 'donut':        return new THREE.TorusGeometry(2.2, 1.0, 16, 48);
        case 'capsule': {
            // r128 doesn't ship CapsuleGeometry — build one by merging a
            // cylinder body with two hemispheric caps (matches the capsule SDF
            // exactly: h=3 cylinder body, radius 1.8 caps at ±1.5).
            const r = 1.8, h = 3;
            const cyl = new THREE.CylinderGeometry(r, r, h, 24, 1, true).toNonIndexed();
            const top = new THREE.SphereGeometry(r, 24, 12).toNonIndexed();
            top.translate(0, h / 2, 0);
            const bot = new THREE.SphereGeometry(r, 24, 12).toNonIndexed();
            bot.translate(0, -h / 2, 0);
            const cp = cyl.attributes.position.array;
            const tp = top.attributes.position.array;
            const bp = bot.attributes.position.array;
            const arr = new Float32Array(cp.length + tp.length + bp.length);
            arr.set(cp);
            arr.set(tp, cp.length);
            arr.set(bp, cp.length + tp.length);
            const merged = new THREE.BufferGeometry();
            merged.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            merged.computeVertexNormals();
            return merged;
        }
        case 'octahedron':   return new THREE.OctahedronGeometry(3.5);
        case 'tetrahedron':  return new THREE.TetrahedronGeometry(3.5);
        case 'pyramid':      return new THREE.ConeGeometry(3 * Math.SQRT2, 6, 4);
        case 'hourglass': {
            // True hourglass: narrow middle (y=0), wide ends (y=±3) — matches SDF
            // Top cone: apex at y=0, base at y=+3 (so flip default cone, then shift up)
            const top = new THREE.ConeGeometry(3, 3, 32).toNonIndexed();
            top.rotateX(Math.PI);
            top.translate(0, 1.5, 0);
            // Bottom cone: apex at y=0, base at y=-3
            const bot = new THREE.ConeGeometry(3, 3, 32).toNonIndexed();
            bot.translate(0, -1.5, 0);
            const merged = new THREE.BufferGeometry();
            const tp = top.attributes.position.array;
            const bp = bot.attributes.position.array;
            const arr = new Float32Array(tp.length + bp.length);
            arr.set(tp); arr.set(bp, tp.length);
            merged.setAttribute('position', new THREE.BufferAttribute(arr, 3));
            merged.computeVertexNormals();
            return merged;
        }
        case 'knot':         return new THREE.TorusKnotGeometry(KNOT_R, KNOT_TUBE, 96, 12, KNOT_p, KNOT_q);
        case 'plane':        return new THREE.BoxGeometry(8, 1, 8);
        default:             return new THREE.SphereGeometry(3, 32, 16);
    }
}

// ────────────────────────────────────────────────
// COMPASS → 3D vector. Convention: looking down +Y (top-down map view),
// N is -Z, S is +Z, E is +X, W is -X. UP is +Y, DOWN is -Y.
// ────────────────────────────────────────────────
const DIR_VECTORS = {
    N:  [ 0, 0, -1],
    NE: [ 1, 0, -1],
    E:  [ 1, 0,  0],
    SE: [ 1, 0,  1],
    S:  [ 0, 0,  1],
    SW: [-1, 0,  1],
    W:  [-1, 0,  0],
    NW: [-1, 0, -1],
    UP: [ 0, 1,  0],
    DOWN:[0,-1,  0],
};
const enabledDirs = new Set(Object.keys(DIR_VECTORS));

// ────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────
let worms = [];
let voxelMap = new Set();              // cells inside the current shape: "x,y,z"
let paintedMap = new Map();            // pos string → mesh idx (the persistent pattern)
let paintedKeys = [];                  // reverse: mesh idx → pos string (for swap-and-pop on unpaint)
let frameCount = 0, lastFpsT = 0, fps = 0;

// ────────────────────────────────────────────────
// AUDIO — multi-layer procedural music. Layers:
//   1) Pad: 3-voice detuned drone with slow LFO on its own gain (breathing)
//   2) Pentatonic melody: triangle notes, fired on worm steps, pitch ∝ head.iy
//   3) Kick: low sine sweep, autonomous on a 4/4 grid
//   4) Hi-hat: short filtered noise burst, on the offbeats
//   5) Bell: FM-synth (modulator + carrier), fired on reproduction events
//   6) Sub-bass thud: sawtooth, fired on death events
// Master chain: gain → lowpass → compressor → destination, plus a parallel
// reverb send for spatial depth.
// ────────────────────────────────────────────────
let audioCtx = null;
let audioMaster = null;
let audioPostFilter = null;
let audioEnabled = false;
let audioVolume = 1.0;          // FULL by default
const PENTATONIC = [
    261.63, 293.66, 329.63, 392.00, 440.00,
    523.25, 587.33, 659.25, 783.99, 880.00,
];
const NOTE_BUDGET_PER_SEC = 14;
let _noteTokens = NOTE_BUDGET_PER_SEC;
let _lastTokenT = 0;

let _hatBuffer = null;          // pre-generated white noise for hi-hats
let _nextBeatTime = 0;          // audioCtx.currentTime of the next scheduled beat
let _beatStep = 0;
const BEAT_INTERVAL_S = 0.32;   // ~94 BPM eighth-note pulse

function _makeImpulse(ctx, durS) {
    const len = Math.floor(ctx.sampleRate * durS);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
        }
    }
    return ir;
}

function _makeNoise(ctx, durS) {
    const len = Math.floor(ctx.sampleRate * durS);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
}

function ensureAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx = new Ctx();

    // master chain: gain → lowpass (warmth) → compressor (punch) → out
    audioMaster = audioCtx.createGain();
    audioMaster.gain.value = audioVolume;

    audioPostFilter = audioCtx.createBiquadFilter();
    audioPostFilter.type = 'lowpass';
    audioPostFilter.frequency.value = 9000;
    audioPostFilter.Q.value = 0.5;

    const compressor = audioCtx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 6;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.05;

    audioMaster
        .connect(audioPostFilter)
        .connect(compressor)
        .connect(audioCtx.destination);

    // reverb send (parallel)
    const conv = audioCtx.createConvolver();
    conv.buffer = _makeImpulse(audioCtx, 1.6);
    const reverbSend = audioCtx.createGain();
    reverbSend.gain.value = 0.32;
    audioMaster.connect(reverbSend).connect(conv).connect(compressor);

    _hatBuffer = _makeNoise(audioCtx, 0.06);

    // 3-voice detuned pad with breathing LFO
    const padOut = audioCtx.createGain();
    padOut.gain.value = 0.028;
    const padFreqs = [130.81, 196.00, 261.63]; // C3, G3, C4
    const padDetunes = [-4, 0, 5];
    padFreqs.forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        osc.type = i === 1 ? 'triangle' : 'sine';
        osc.frequency.value = f;
        osc.detune.value = padDetunes[i];
        osc.connect(padOut);
        osc.start();
    });
    // LFO modulates pad gain so it gently swells in/out
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();
    lfo.frequency.value = 0.13;
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(padOut.gain);
    lfo.start();
    padOut.connect(audioMaster);

    _nextBeatTime = audioCtx.currentTime + 0.05;
    _beatStep = 0;
}

function playNote(freq, duration = 0.45, type = 'triangle', vol = 0.16) {
    if (!audioEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    const dt = now - _lastTokenT;
    _noteTokens = Math.min(NOTE_BUDGET_PER_SEC, _noteTokens + dt * NOTE_BUDGET_PER_SEC);
    _lastTokenT = now;
    if (_noteTokens < 1) return;
    _noteTokens -= 1;

    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(vol, now + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env).connect(audioMaster);
    osc.start(now);
    osc.stop(now + duration + 0.05);
}

function playKickAt(t) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const env = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.18);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(env).connect(audioMaster);
    osc.start(t);
    osc.stop(t + 0.4);
}

function playHatAt(t, vol = 0.07) {
    if (!audioCtx || !_hatBuffer) return;
    const src = audioCtx.createBufferSource();
    src.buffer = _hatBuffer;
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7200;
    const env = audioCtx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.001);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(filter).connect(env).connect(audioMaster);
    src.start(t);
    src.stop(t + 0.06);
}

function playBell(freq, duration = 0.9, vol = 0.08) {
    if (!audioCtx) return;
    const t = audioCtx.currentTime;
    const carrier = audioCtx.createOscillator();
    const modulator = audioCtx.createOscillator();
    const modGain = audioCtx.createGain();
    const env = audioCtx.createGain();
    carrier.type = 'sine';
    modulator.type = 'sine';
    carrier.frequency.value = freq;
    modulator.frequency.value = freq * 1.4;
    modGain.gain.value = freq * 1.2;
    modulator.connect(modGain).connect(carrier.frequency);
    carrier.connect(env).connect(audioMaster);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    modulator.start(t);
    modulator.stop(t + duration + 0.05);
    carrier.start(t);
    carrier.stop(t + duration + 0.05);
}

// Schedule autonomous drum events ahead of the audio clock. Called every frame
// from animate(); only schedules notes whose timestamp is within ~0.3s ahead,
// so wall-clock pacing stays even while requestAnimationFrame ticks irregularly.
function tickAudioScheduler() {
    if (!audioEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    while (_nextBeatTime < now + 0.3) {
        // 4-on-the-floor kick on every 4th eighth-note (= every quarter)
        if (_beatStep % 4 === 0) playKickAt(_nextBeatTime);
        // hat on every step, accent on the offbeats
        playHatAt(_nextBeatTime, _beatStep % 2 === 1 ? 0.09 : 0.05);
        // occasional bell sparkle
        if (_beatStep % 16 === 12 && Math.random() < 0.6) {
            const idx = 5 + Math.floor(Math.random() * 5);
            playBell(PENTATONIC[idx], 1.0, 0.05);
        }
        _beatStep++;
        _nextBeatTime += BEAT_INTERVAL_S;
    }
}

function noteForCell(c) {
    const t = (c.iy + HALF_GRID) / (HALF_GRID * 2);
    const idx = Math.max(0, Math.min(PENTATONIC.length - 1, Math.floor(t * PENTATONIC.length)));
    return PENTATONIC[idx];
}

function setMusicEnabled(on) {
    audioEnabled = on;
    if (on) {
        ensureAudio();
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (audioCtx) _nextBeatTime = audioCtx.currentTime + 0.05;
    }
    if (audioMaster) {
        audioMaster.gain.setTargetAtTime(on ? audioVolume : 0, audioCtx.currentTime, 0.05);
    }
}

// ────────────────────────────────────────────────
// UI references
// ────────────────────────────────────────────────
const geoSelect = document.getElementById('geometry-select');
const deathProxInput = document.getElementById('death-proximity');
const deathRateSlider = document.getElementById('death-rate');
const deathRateVal = document.getElementById('death-rate-val');
const reproRateSlider = document.getElementById('repro-rate');
const reproRateVal = document.getElementById('repro-rate-val');
const tickSpeedSlider = document.getElementById('tick-speed');
const tickSpeedVal = document.getElementById('tick-speed-val');
const statWorms = document.getElementById('stat-worms');
const statPixels = document.getElementById('stat-pixels');
const statFps = document.getElementById('stat-fps');
const statDeaths = document.getElementById('stat-deaths');
let deathCount = 0;

deathRateSlider.addEventListener('input', () => deathRateVal.textContent = deathRateSlider.value);
reproRateSlider.addEventListener('input', () => reproRateVal.textContent = reproRateSlider.value);
tickSpeedSlider.addEventListener('input', () => {
    const hz = parseInt(tickSpeedSlider.value, 10);
    tickSpeedVal.textContent = hz;
    tickIntervalMs = 1000 / hz;
});

const wormLengthSlider = document.getElementById('worm-length');
const wormLengthVal = document.getElementById('worm-length-val');
wormLengthSlider.addEventListener('input', () => {
    userMaxLen = parseInt(wormLengthSlider.value, 10);
    wormLengthVal.textContent = userMaxLen;
});
const musicToggleEl = document.getElementById('music-toggle');
const musicVolumeEl = document.getElementById('music-volume');
musicToggleEl.addEventListener('change', () => setMusicEnabled(musicToggleEl.checked));
musicVolumeEl.addEventListener('input', () => {
    audioVolume = parseInt(musicVolumeEl.value, 10) / 100;
    if (audioEnabled && audioMaster) {
        audioMaster.gain.setTargetAtTime(audioVolume, audioCtx.currentTime, 0.05);
    }
});

document.querySelectorAll('button.dir').forEach(btn => {
    btn.addEventListener('click', () => {
        const d = btn.dataset.dir;
        if (enabledDirs.has(d)) {
            if (enabledDirs.size > 1) enabledDirs.delete(d);
        } else {
            enabledDirs.add(d);
        }
        btn.classList.toggle('on', enabledDirs.has(d));
    });
});

// ────────────────────────────────────────────────
// SCENE — wireframe shape + faint lattice + persistent paint layer + worm bodies
// ────────────────────────────────────────────────
function init() {
    container = document.getElementById('canvas-container');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(10, 8, 12);

    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.3;       // wheel-zoom right inside the shape
    controls.maxDistance = 80;

    // Lit voxels — Lambert shading gives the Minecraft-style 3D depth on the
    // accumulating box pattern. Ambient + one directional from upper-front.
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const dl = new THREE.DirectionalLight(0xffffff, 0.75);
    dl.position.set(8, 14, 6);
    scene.add(dl);

    // global worm head marker mesh (small bright cube)
    scene.add(wormHeadMesh);

    rebuildContainer(geoSelect.value);

    // attach pointer handlers directly to the canvas — capture phase so we
    // run before OrbitControls' own listeners and can decide whether to spawn
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('contextmenu', e => {
        e.preventDefault();
        saveImage();
    });

    animate(0);
}

// pointerdown bookkeeping: only treat as a "click" if the pointer didn't
// move much between down and up (so OrbitControls can still rotate freely)
let _downAt = null;
function onPointerDown(e) {
    if (e.button !== 0) return; // left-click only
    _downAt = { x: e.clientX, y: e.clientY };
    const onUp = (eu) => {
        renderer.domElement.removeEventListener('pointerup', onUp);
        if (!_downAt) return;
        const dx = eu.clientX - _downAt.x;
        const dy = eu.clientY - _downAt.y;
        _downAt = null;
        if (dx * dx + dy * dy > 25) return; // dragged → orbit, don't spawn
        spawnWormFromClick(eu);
    };
    renderer.domElement.addEventListener('pointerup', onUp);
}

function spawnWormFromClick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    let spawn = null;

    // 1) try raycasting against the container surface
    if (surface) {
        const hits = raycaster.intersectObject(surface, false);
        if (hits.length) {
            const p = hits[0].point.clone().multiplyScalar(0.92);
            const cell = nearestVoxel(p);
            if (cell) spawn = cell;
        }
    }

    // 2) fallback — march along the ray and pick the first interior cell
    if (!spawn) {
        const ray = raycaster.ray;
        const tmp = new THREE.Vector3();
        for (let t = 0.5; t < 80; t += 0.25) {
            tmp.copy(ray.origin).addScaledVector(ray.direction, t);
            const cell = voxelAt(tmp);
            if (cell) { spawn = cell; break; }
        }
    }

    // 3) ultimate fallback — origin
    if (!spawn && voxelMap.has('0,0,0')) spawn = { ix: 0, iy: 0, iz: 0 };
    if (!spawn) {
        // pick any cell
        for (const k of voxelMap) {
            const [a, b, c] = k.split(',').map(Number);
            spawn = { ix: a, iy: b, iz: c };
            break;
        }
    }

    if (spawn) worms.push(new Worm(spawn.ix, spawn.iy, spawn.iz));
}

function voxelAt(p) {
    const ix = Math.round(p.x / VOXEL);
    const iy = Math.round(p.y / VOXEL);
    const iz = Math.round(p.z / VOXEL);
    return voxelMap.has(`${ix},${iy},${iz}`) ? { ix, iy, iz } : null;
}

function nearestVoxel(p) {
    // search outward up to 2 cells from the rounded position
    const cx = Math.round(p.x / VOXEL);
    const cy = Math.round(p.y / VOXEL);
    const cz = Math.round(p.z / VOXEL);
    for (let r = 0; r <= 3; r++) {
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            const k = `${cx + dx},${cy + dy},${cz + dz}`;
            if (voxelMap.has(k)) return { ix: cx + dx, iy: cy + dy, iz: cz + dz };
        }
    }
    return null;
}

// rendered objects we swap out when shape changes
let wireframe = null;       // crisp edge LineSegments
let surface = null;         // ultra-faint volumetric hint (mesh w/ tiny opacity)
let lattice = null;         // dotted Points showing voxel grid
let paintMesh = null;       // InstancedMesh of painted voxels (the cell-mark dots)
let MAX_PAINT = 30000;
let paintCount = 0;

// Accumulated trail lines — head-to-head segments per tick. This is the visible
// pattern that builds up over time, matching the 2D worm-sim aesthetic.
const MAX_TRAIL_SEGS = 80000;
let trailLines = null;
let trailGeo = null;
let trailPositions = null;
let trailSegCount = 0;
function addTrailSegment(fx, fy, fz, tx, ty, tz) {
    if (!trailGeo || trailSegCount >= MAX_TRAIL_SEGS) return;
    const i = trailSegCount * 6;
    trailPositions[i  ] = fx; trailPositions[i+1] = fy; trailPositions[i+2] = fz;
    trailPositions[i+3] = tx; trailPositions[i+4] = ty; trailPositions[i+5] = tz;
    trailSegCount++;
    trailGeo.attributes.position.needsUpdate = true;
    trailGeo.setDrawRange(0, trailSegCount * 2);
}

function rebuildContainer(type) {
    // remove previous
    [wireframe, surface, lattice, paintMesh].forEach(o => {
        if (o) { scene.remove(o); o.geometry?.dispose?.(); }
    });

    // 1) the actual geometry — used for both wireframe and raycast spawn
    const geo = buildShapeGeometry(type);

    // 2) the surface mesh is kept (used for raycast spawning) but invisible —
    //    the painted voxels themselves are the visualization
    surface = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
            color: 0x0f380f,
            transparent: true,
            opacity: 0.0,           // invisible to render but raycasts still hit
            side: THREE.DoubleSide,
            depthWrite: false,
        })
    );
    surface.userData.isContainer = true;
    scene.add(surface);

    // 3) container outline — bright accent green so the boundary is clearly
    //    visible against the black background even before any paint
    const edges = new THREE.EdgesGeometry(geo, 18);
    wireframe = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xc2d62b, transparent: true, opacity: 0.85 })
    );
    scene.add(wireframe);

    // 4) build voxel lattice for the chosen shape
    voxelMap.clear();
    const lp = [];
    for (let ix = -HALF_GRID; ix <= HALF_GRID; ix++) {
        for (let iy = -HALF_GRID; iy <= HALF_GRID; iy++) {
            for (let iz = -HALF_GRID; iz <= HALF_GRID; iz++) {
                const x = ix * VOXEL, y = iy * VOXEL, z = iz * VOXEL;
                if (isInside(x, y, z, type)) {
                    voxelMap.add(`${ix},${iy},${iz}`);
                    lp.push(x, y, z);
                }
            }
        }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
    lattice = new THREE.Points(lg, new THREE.PointsMaterial({
        color: 0x0f380f, size: 1.2, sizeAttenuation: false,
        transparent: true, opacity: 0,   // hidden — voxel boxes ARE the lattice
    }));
    scene.add(lattice);

    // 5) THE PATTERN — every visited cell drops a real lit cube with a random
    //    green shade picked per-instance. White material color so instanceColor
    //    shows through directly. Lambert shading gives the 3D pixel-art depth.
    // smaller cubes leave visible black gaps between adjacent painted cells —
    // gives that crisp "pixel block" look from the reference image
    const pgeo = new THREE.BoxGeometry(VOXEL * 0.78, VOXEL * 0.78, VOXEL * 0.78);
    const pmat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    paintMesh = new THREE.InstancedMesh(pgeo, pmat, MAX_PAINT);
    paintMesh.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(MAX_PAINT * 3), 3
    );
    paintMesh.count = 0;
    paintMesh.frustumCulled = false;
    scene.add(paintMesh);
    paintedMap.clear();
    paintedKeys.length = 0;
    paintCount = 0;

    // trail lines — kept for state continuity but hidden in voxel-paint mode
    if (trailLines) {
        scene.remove(trailLines);
        trailLines.geometry.dispose();
    }
    trailGeo = new THREE.BufferGeometry();
    trailPositions = new Float32Array(MAX_TRAIL_SEGS * 6);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
    trailGeo.setDrawRange(0, 0);
    trailLines = new THREE.LineSegments(
        trailGeo,
        new THREE.LineBasicMaterial({ color: 0x0f380f, transparent: true, opacity: 0.0 })
    );
    trailLines.visible = false;
    trailLines.frustumCulled = false;
    scene.add(trailLines);
    trailSegCount = 0;

    // wipe worms (their meshes will be removed too)
    worms.forEach(w => w.dispose());
    worms = [];
}

geoSelect.addEventListener('change', () => rebuildContainer(geoSelect.value));

// ────────────────────────────────────────────────
// PAINT a voxel into the persistent pattern layer
// ────────────────────────────────────────────────
const _m = new THREE.Matrix4();
const _paintColor = new THREE.Color();
const _swapColor = new THREE.Color();
const _swapMatrix = new THREE.Matrix4();

// Returns true if this call actually added a new instance (so the caller can
// track ownership for later removal on death).
function paint(ix, iy, iz) {
    const key = `${ix},${iy},${iz}`;
    if (paintedMap.has(key)) return false;
    if (paintCount >= MAX_PAINT) return false;
    _m.makeTranslation(ix * VOXEL, iy * VOXEL, iz * VOXEL);
    paintMesh.setMatrixAt(paintCount, _m);

    _paintColor.setHSL(
        0.20 + Math.random() * 0.10,
        0.65 + Math.random() * 0.35,
        0.28 + Math.random() * 0.32
    );
    paintMesh.setColorAt(paintCount, _paintColor);

    paintedMap.set(key, paintCount);
    paintedKeys[paintCount] = key;
    paintCount++;
    paintMesh.count = paintCount;
    paintMesh.instanceMatrix.needsUpdate = true;
    if (paintMesh.instanceColor) paintMesh.instanceColor.needsUpdate = true;
    return true;
}

// Remove a painted cell from the instanced mesh. Swap-and-pop: move the
// last instance into the freed slot so the active range stays contiguous.
function unpaintCell(key) {
    const idx = paintedMap.get(key);
    if (idx === undefined) return;
    const lastIdx = paintCount - 1;
    if (idx !== lastIdx) {
        paintMesh.getMatrixAt(lastIdx, _swapMatrix);
        paintMesh.setMatrixAt(idx, _swapMatrix);
        if (paintMesh.instanceColor) {
            paintMesh.getColorAt(lastIdx, _swapColor);
            paintMesh.setColorAt(idx, _swapColor);
        }
        const movedKey = paintedKeys[lastIdx];
        paintedMap.set(movedKey, idx);
        paintedKeys[idx] = movedKey;
    }
    paintedMap.delete(key);
    paintedKeys.length = lastIdx;
    paintCount--;
    paintMesh.count = paintCount;
    paintMesh.instanceMatrix.needsUpdate = true;
    if (paintMesh.instanceColor) paintMesh.instanceColor.needsUpdate = true;
}

// ────────────────────────────────────────────────
// WORM
// ────────────────────────────────────────────────
// ────────────────────────────────────────────────
// WORM RENDERING — voxel-paint mode: worms themselves are mostly invisible.
// The painted cube pattern IS the visualization. We keep one global instanced
// mesh of small bright cubes that mark active worm head positions so you can
// still see where the agents are spawning/moving.
// ────────────────────────────────────────────────
const MAX_HEADS = 512;
const _headGeo = new THREE.BoxGeometry(VOXEL * 1.05, VOXEL * 1.05, VOXEL * 1.05);
const _headMat = new THREE.MeshLambertMaterial({ color: 0xeaff7a, emissive: 0x4a6a0a });
const wormHeadMesh = new THREE.InstancedMesh(_headGeo, _headMat, MAX_HEADS);
wormHeadMesh.count = 0;
wormHeadMesh.frustumCulled = false;

class Worm {
    constructor(ix, iy, iz) {
        this.cells = [{ ix, iy, iz }];        // integer voxel coords, head at index 0
        this.isDead = false;
        this.painted = new Set();             // cells this worm personally painted
        if (paint(ix, iy, iz)) this.painted.add(`${ix},${iy},${iz}`);
    }

    pickDir() {
        // Pick a random ENABLED compass direction. Equivalent to worm-sim's
        // getRandomAllowedAngle but in 3D.
        const list = [];
        for (const k of enabledDirs) list.push(k);
        if (!list.length) return null;
        return DIR_VECTORS[list[Math.floor(Math.random() * list.length)]];
    }

    update() {
        if (this.isDead) return;
        const head = this.cells[0];

        // pick direction; ricochet on missing voxel by inverting the offending axes
        const dir = this.pickDir();
        if (!dir) return;
        let dx = dir[0], dy = dir[1], dz = dir[2];

        // tiny jitter — small chance to swap one axis component for organic feel
        if (Math.random() < 0.08) {
            const a = Math.floor(Math.random() * 3);
            if (a === 0) dx = -dx;
            else if (a === 1) dy = -dy;
            else dz = -dz;
        }

        let nx = head.ix + dx, ny = head.iy + dy, nz = head.iz + dz;

        // ricochet: if next cell isn't inside the container, fall back to
        // sampling RANDOMLY among ALL valid 26-neighbor cells. Picking randomly
        // (instead of the first axis-flip combination) prevents the oscillation
        // bug where a worm with a single allowed direction bounces forever
        // between the same two cells in a corner.
        if (!voxelMap.has(`${nx},${ny},${nz}`)) {
            const candidates = [];
            for (let ddx = -1; ddx <= 1; ddx++) {
                for (let ddy = -1; ddy <= 1; ddy++) {
                    for (let ddz = -1; ddz <= 1; ddz++) {
                        if (ddx === 0 && ddy === 0 && ddz === 0) continue;
                        const k = `${head.ix + ddx},${head.iy + ddy},${head.iz + ddz}`;
                        if (voxelMap.has(k)) {
                            candidates.push(head.ix + ddx, head.iy + ddy, head.iz + ddz);
                        }
                    }
                }
            }
            if (!candidates.length) return; // truly trapped — try again next tick
            const pick = Math.floor(Math.random() * (candidates.length / 3)) * 3;
            nx = candidates[pick]; ny = candidates[pick + 1]; nz = candidates[pick + 2];
        }

        // append a trail line from the previous head position to the new one —
        // this is what makes the pattern READ as a connected path, not dots
        const prevHead = this.cells[0];
        addTrailSegment(
            prevHead.ix * VOXEL, prevHead.iy * VOXEL, prevHead.iz * VOXEL,
            nx * VOXEL,          ny * VOXEL,          nz * VOXEL
        );

        const newHead = { ix: nx, iy: ny, iz: nz };
        this.cells.unshift(newHead);
        // keep cells array bounded by user-chosen length (constant length, no
        // unbounded growth that ate memory and grew snake-trails forever)
        while (this.cells.length > userMaxLen) this.cells.pop();
        if (paint(nx, ny, nz)) this.painted.add(`${nx},${ny},${nz}`);

        // procedural music — every step has a chance to play a note. The
        // note-token budget caps overall density so a swarm doesn't pile up.
        if (audioEnabled && Math.random() < 0.18) {
            playNote(noteForCell(newHead), 0.5, 'triangle', 0.10);
        }


        // reproduction (matches worm-sim scale)
        const reproRate = parseFloat(reproRateSlider.value);
        if (Math.random() * 1000 < reproRate * 3) {
            worms.push(new Worm(nx, ny, nz));
            // birth bell — FM-synth chime, much richer than a plain sine
            if (audioEnabled) {
                const idx = 6 + Math.floor(Math.random() * 4);
                playBell(PENTATONIC[idx], 1.2, 0.07);
            }
        }

        this._checkDeath();
    }


    _checkDeath() {
        const rate = parseFloat(deathRateSlider.value);
        if (rate === 0) return;
        const prox = parseFloat(deathProxInput.value); // now in voxel-cell units
        if (prox <= 0) return;
        const prox2 = prox * prox;
        const head = this.cells[0];
        for (const o of worms) {
            if (o === this || o.isDead) continue;
            const oh = o.cells[0];
            const dx = (head.ix - oh.ix);
            const dy = (head.iy - oh.iy);
            const dz = (head.iz - oh.iz);
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < prox2 && Math.random() * 100 < rate) {
                this.isDead = true;
                deathCount++;
                this.dispose();   // unpaints every cell this worm painted
                if (audioEnabled) playNote(98, 0.55, 'sawtooth', 0.06);
                return;
            }
        }
    }

    dispose() {
        // remove every cell this worm personally painted from the canvas —
        // dead worms leave no body behind. Cells painted by other worms
        // (which this worm walked over) are not affected.
        for (const key of this.painted) unpaintCell(key);
        this.painted.clear();
    }
}

// ────────────────────────────────────────────────
// INPUT — handlers attached inside init() once renderer exists
// ────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ────────────────────────────────────────────────
// CLEAR / EXPORT
// ────────────────────────────────────────────────
document.getElementById('clear-btn').onclick = () => {
    worms.forEach(w => w.dispose());
    worms = [];
    paintedMap.clear();
    paintedKeys.length = 0;
    paintCount = 0;
    if (paintMesh) {
        paintMesh.count = 0;
        paintMesh.instanceMatrix.needsUpdate = true;
    }
    trailSegCount = 0;
    if (trailGeo) trailGeo.setDrawRange(0, 0);
    deathCount = 0;
    if (statDeaths) statDeaths.textContent = '0';
};

document.getElementById('export-btn').onclick = saveImage;
document.getElementById('export-obj-btn').onclick = exportOBJ;

// ────────────────────────────────────────────────
// OBJ EXPORT — gather the container shape, all painted cells, and live worm
// tubes into one merged mesh and serialize via THREE.OBJExporter. The result
// is a high-quality, watertight-ish triangle mesh suitable for Blender, MeshLab,
// 3D-printing slicers, etc.
// ────────────────────────────────────────────────
function exportOBJ() {
    if (typeof THREE.OBJExporter !== 'function') {
        alert('OBJExporter failed to load — check network.');
        return;
    }

    const group = new THREE.Group();
    const utils = THREE.BufferGeometryUtils;

    // 1) container shape — clone the geometry so the live mesh isn't affected
    if (surface) {
        const containerGeo = surface.geometry.clone();
        containerGeo.computeVertexNormals();
        const m = new THREE.Mesh(containerGeo);
        m.name = `container_${geoSelect.value}`;
        group.add(m);
    }

    // 2) painted cells — explode the InstancedMesh into a single merged mesh.
    //    Use higher-res spheres for export quality; final geometry has proper normals.
    if (paintCount > 0) {
        const dotGeo = new THREE.SphereGeometry(VOXEL * 0.28, 16, 12);
        const matrix = new THREE.Matrix4();
        const pieces = [];
        for (let i = 0; i < paintCount; i++) {
            paintMesh.getMatrixAt(i, matrix);
            const g = dotGeo.clone();
            g.applyMatrix4(matrix);
            pieces.push(g);
        }
        if (pieces.length && utils && utils.mergeBufferGeometries) {
            const merged = utils.mergeBufferGeometries(pieces, false);
            if (merged) {
                merged.computeVertexNormals();
                const m = new THREE.Mesh(merged);
                m.name = 'pattern_dots';
                group.add(m);
            }
        } else {
            // fallback if BufferGeometryUtils didn't load — add each piece individually
            pieces.forEach((g, i) => {
                g.computeVertexNormals();
                const m = new THREE.Mesh(g);
                m.name = `dot_${i}`;
                group.add(m);
            });
        }
    }

    // 3) accumulated trail lines — include as Line geometry in the OBJ. Most
    //    3D apps render these as edge wireframes; can be extruded in Blender.
    if (trailSegCount > 0) {
        const lineGeo = new THREE.BufferGeometry();
        const slice = trailPositions.slice(0, trailSegCount * 6);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(slice, 3));
        const line = new THREE.LineSegments(lineGeo);
        line.name = 'trail_lines';
        group.add(line);
    }

    // 4) live worm body dots — build a smooth tube along each worm's cells so
    //    the OBJ contains real worm-shaped geometry (better than dot clouds for
    //    print/edit). One Mesh per alive worm.
    worms.forEach((w, i) => {
        if (w.isDead) return;
        if (w.cells.length >= 2) {
            const points = w.cells.map(c =>
                new THREE.Vector3(c.ix * VOXEL, c.iy * VOXEL, c.iz * VOXEL)
            );
            const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.5);
            const segs = Math.max(points.length * 4, 8);
            const tubeGeo = new THREE.TubeGeometry(curve, segs, VOXEL * 0.22, 8, false);
            tubeGeo.computeVertexNormals();
            const m = new THREE.Mesh(tubeGeo);
            m.name = `worm_${i}_body`;
            group.add(m);
        }
        // head sphere
        const headGeo = new THREE.SphereGeometry(VOXEL * 0.4, 16, 12);
        headGeo.computeVertexNormals();
        const head = new THREE.Mesh(headGeo);
        const c0 = w.cells[0];
        head.position.set(c0.ix * VOXEL, c0.iy * VOXEL, c0.iz * VOXEL);
        head.name = `worm_${i}_head`;
        group.add(head);
    });

    const exporter = new THREE.OBJExporter();
    const objText = exporter.parse(group);
    const blob = new Blob([objText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `worm3d-${geoSelect.value}-${Date.now()}.obj`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function saveImage() {
    renderer.render(scene, camera);
    const w = renderer.domElement.width, h = renderer.domElement.height;
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const o = out.getContext('2d');
    o.fillStyle = '#9bbc0f';
    o.fillRect(0, 0, w, h);
    o.drawImage(renderer.domElement, 0, 0);
    o.fillStyle = '#0f380f';
    o.font = '12px ui-monospace, "Courier New", monospace';
    o.textAlign = 'right';
    const stamp = `worm.3d-fabric · ${geoSelect.value} · ${new Date().toISOString().slice(0,16).replace('T',' ')}`;
    o.fillText(stamp, w - 8, h - 10);
    out.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worm3d-${geoSelect.value}-${Date.now()}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
    }, 'image/png');
}

// ────────────────────────────────────────────────
// LOOP
// ────────────────────────────────────────────────
// Update head InstancedMesh matrices from the worm cell lists. Body cells
// are not rendered — the painted cube pattern at the cells visited is the
// visualization.
const _syncMat = new THREE.Matrix4();
function syncWormMeshes() {
    let hIdx = 0;
    for (const w of worms) {
        if (w.isDead) continue;
        if (hIdx >= MAX_HEADS) break;
        const c = w.cells[0];
        _syncMat.makeTranslation(c.ix * VOXEL, c.iy * VOXEL, c.iz * VOXEL);
        wormHeadMesh.setMatrixAt(hIdx, _syncMat);
        hIdx++;
    }
    wormHeadMesh.count = hIdx;
    wormHeadMesh.instanceMatrix.needsUpdate = true;
}

let lastTickT = 0;
let tickIntervalMs = 1000 / 60; // gets updated by the tick-speed slider

function animate(t) {
    requestAnimationFrame(animate);

    // step the simulation at the configured tick rate (independent of frame rate)
    if (t - lastTickT >= tickIntervalMs) {
        const stepsThisFrame = Math.min(4, Math.floor((t - lastTickT) / tickIntervalMs));
        for (let i = 0; i < stepsThisFrame; i++) {
            worms = worms.filter(w => !w.isDead);
            worms.forEach(w => w.update());
        }
        lastTickT = t;
    }

    syncWormMeshes();
    tickAudioScheduler();
    controls.update();
    renderer.render(scene, camera);

    frameCount++;
    if (t - lastFpsT >= 1000) {
        fps = frameCount;
        frameCount = 0; lastFpsT = t;
        statFps.textContent = fps;
        statWorms.textContent = worms.length;
        statPixels.textContent = paintCount;
        if (statDeaths) statDeaths.textContent = deathCount;
    }
}

window.addEventListener('resize', () => {
    if (!renderer) return;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});

window.addEventListener('load', init);
