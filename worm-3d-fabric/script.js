// WORM.3D-FABRIC - Interactive Voxel Canvas
let container, scene, camera, renderer, controls;
const VOXEL_SIZE = 0.5;
const GRID_RES = 22; 

function init() {
    container = document.getElementById('canvas-container');
    if (!container) return;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);

    renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    container.appendChild(renderer.domElement);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x9bbc0f, 1.5, 100);
    pointLight.position.set(10, 20, 10);
    scene.add(pointLight);

    updateVoxelCanvas();
    animate(0);
}

// UI Elements & State
const geoSelect = document.getElementById('geometry-select');
const deathProxInput = document.getElementById('death-proximity');
const deathRateSlider = document.getElementById('death-rate');
const reproRateSlider = document.getElementById('repro-rate');
const dimChecks = document.querySelectorAll('.dim-check');
const angleChecks = document.querySelectorAll('.angle-check');
const startOverlay = document.getElementById('start-overlay');
const statWorms = document.getElementById('stat-worms');
const statPixels = document.getElementById('stat-pixels');
const statFps = document.getElementById('stat-fps');

let worms = [];
let canvasVoxelMesh = null;
let voxelMap = new Set(); // Stores stringified coordinates "x,y,z"
let isRunning = false;
let frameCount = 0;
let lastTime = 0;

function updateVoxelCanvas() {
    if (canvasVoxelMesh) scene.remove(canvasVoxelMesh);
    voxelMap.clear();

    const type = geoSelect.value;
    const voxels = [];
    const halfRes = GRID_RES / 2;

    for (let x = -halfRes; x < halfRes; x++) {
        for (let y = -halfRes; y < halfRes; y++) {
            for (let z = -halfRes; z < halfRes; z++) {
                const px = Math.round(x * VOXEL_SIZE * 100) / 100;
                const py = Math.round(y * VOXEL_SIZE * 100) / 100;
                const pz = Math.round(z * VOXEL_SIZE * 100) / 100;
                
                if (isInside(px, py, pz, type)) {
                    const pos = new THREE.Vector3(px, py, pz);
                    voxels.push(pos);
                    voxelMap.add(`${px},${py},${pz}`);
                }
            }
        }
    }

    const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.9, VOXEL_SIZE * 0.9, VOXEL_SIZE * 0.9);
    const mat = new THREE.MeshPhongMaterial({ 
        color: 0x306230, 
        transparent: true, 
        opacity: 0.15 
    });
    
    canvasVoxelMesh = new THREE.InstancedMesh(geo, mat, voxels.length);
    const dummy = new THREE.Object3D();
    voxels.forEach((v, i) => {
        dummy.position.copy(v);
        dummy.updateMatrix();
        canvasVoxelMesh.setMatrixAt(i, dummy.matrix);
    });
    
    scene.add(canvasVoxelMesh);
}

function isInside(x, y, z, type) {
    const dist = Math.sqrt(x*x + y*y + z*z);
    switch (type) {
        case 'cube': return Math.abs(x) < 4.1 && Math.abs(y) < 4.1 && Math.abs(z) < 4.1;
        case 'sphere': return dist < 5.1;
        case 'cone': return y > -4 && y < 4 && Math.sqrt(x*x + z*z) < ((8 - (y + 4)) / 8 * 4.5);
        case 'donut': 
            const R = 4, rT = 1.6;
            return Math.sqrt((Math.sqrt(x*x + z*z) - R)**2 + y*y) < rT;
        case 'cylinder': return Math.abs(y) < 4.1 && Math.sqrt(x*x + z*z) < 3.1;
        case 'knot': return dist < 5.5 && (Math.sin(x) + Math.cos(y) + Math.sin(z) > 0.8);
        case 'plane': return Math.abs(y) < 0.3 && Math.abs(x) < 8 && Math.abs(z) < 8;
        default: return dist < 5;
    }
}

class VoxelWorm {
    constructor(pos) {
        this.segments = [pos.clone()];
        this.maxLen = 15;
        this.isDead = false;
        this.meshes = [];
        this.addVoxel(this.segments[0]);
    }

    addVoxel(pos) {
        const geo = new THREE.BoxGeometry(VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95, VOXEL_SIZE * 0.95);
        const mat = new THREE.MeshPhongMaterial({ shininess: 100 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(pos);
        scene.add(mesh);
        this.meshes.unshift(mesh);
        this.updateVisuals();
    }

    update() {
        if (this.isDead) return;

        const allowedAngles = Array.from(angleChecks).filter(c => c.checked).map(c => parseInt(c.value));
        const allowedDims = Array.from(dimChecks).filter(c => c.checked).map(c => c.value);
        if (allowedAngles.length === 0 || allowedDims.length === 0) return;

        const angle = allowedAngles[Math.floor(Math.random() * allowedAngles.length)] * (Math.PI / 180);
        
        // Pick two random dimensions to form a 3D plane for the angle
        const d1 = allowedDims[Math.floor(Math.random() * allowedDims.length)];
        let d2 = allowedDims[Math.floor(Math.random() * allowedDims.length)];
        
        const move = new THREE.Vector3();
        move[d1] = Math.round(Math.cos(angle));
        move[d2] = Math.round(Math.sin(angle));
        move.multiplyScalar(VOXEL_SIZE);

        const head = this.segments[0].clone().add(move);
        head.x = Math.round(head.x * 100) / 100;
        head.y = Math.round(head.y * 100) / 100;
        head.z = Math.round(head.z * 100) / 100;

        // Strictly check if the next voxel exists in our 3D Voxel Canvas
        if (!voxelMap.has(`${head.x},${head.y},${head.z}`)) {
            this.isDead = true;
            this.remove();
            return;
        }

        this.segments.unshift(head);
        this.addVoxel(head);

        if (this.segments.length > this.maxLen) {
            const old = this.meshes.pop();
            scene.remove(old);
            old.geometry.dispose();
            this.segments.pop();
        }

        const reproRate = parseFloat(reproRateSlider.value);
        if (Math.random() * 1000 < reproRate * 4) worms.push(new VoxelWorm(head));
        this.checkDeath();
    }

    checkDeath() {
        const head = this.segments[0];
        const prox = parseFloat(deathProxInput.value);
        const rate = parseFloat(deathRateSlider.value);
        if (rate === 0) return;
        for (let other of worms) {
            if (other === this) continue;
            if (head.distanceTo(other.segments[0]) < prox) {
                if (Math.random() * 100 < rate) { this.isDead = true; this.remove(); return; }
            }
        }
    }

    updateVisuals() {
        this.meshes.forEach((m, i) => {
            const r = i / this.maxLen;
            m.material.color.setRGB(0.1 + r*0.2, 0.6 + r*0.4, 0.1);
            m.material.transparent = true;
            m.material.opacity = 1.0 - (r * 0.6);
        });
    }

    remove() { this.meshes.forEach(m => { scene.remove(m); m.geometry.dispose(); }); this.meshes = []; }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('mousedown', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right) return;

    if (!isRunning) { isRunning = true; startOverlay.style.display = 'none'; }
    if (e.button !== 0) return;

    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    
    const hits = raycaster.intersectObject(canvasVoxelMesh);
    if (hits.length > 0) {
        const matrix = new THREE.Matrix4();
        canvasVoxelMesh.getMatrixAt(hits[0].instanceId, matrix);
        const pos = new THREE.Vector3().setFromMatrixPosition(matrix);
        worms.push(new VoxelWorm(pos));
    }
});

geoSelect.addEventListener('change', () => { updateVoxelCanvas(); worms.forEach(w => w.remove()); worms = []; });
document.getElementById('clear-btn').onclick = () => { worms.forEach(w => w.remove()); worms = []; };
document.getElementById('export-btn').onclick = () => {
    renderer.render(scene, camera);
    const link = document.createElement('a');
    link.download = `worm-3d-voxel.png`;
    link.href = renderer.domElement.toDataURL();
    link.click();
};

function animate(t) {
    requestAnimationFrame(animate);
    if (isRunning) {
        worms = worms.filter(w => !w.isDead);
        worms.forEach(w => w.update());
    }
    controls.update();
    renderer.render(scene, camera);
    
    if (t - lastTime >= 1000) {
        statFps.innerText = frameCount;
        statWorms.innerText = worms.length;
        statPixels.innerText = worms.reduce((a, b) => a + b.segments.length, 0);
        frameCount = 0; lastTime = t;
    }
    frameCount++;
}

window.addEventListener('load', init);
window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
});
