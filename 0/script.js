const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const lifeToggle = document.getElementById('lifeToggle');

let width, height;
let particles = [];
let globalHue = 180;
const particleCount = 1500;
const mouse = { x: -1000, y: -1000 };

// Resize canvas
function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}

window.addEventListener('resize', resize);
resize();

// Mouse events
window.addEventListener('mousemove', (e) => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});

window.addEventListener('mouseout', () => {
    mouse.x = -1000;
    mouse.y = -1000;
});

class Particle {
    constructor() {
        this.init();
    }

    init() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 2;
        this.vy = (Math.random() - 0.5) * 2;
        this.size = Math.random() * 2 + 0.5;
        this.maxLife = Math.random() * 200 + 100;
        this.life = this.maxLife;
        this.hueOffset = Math.random() * 60 - 30;
    }

    update() {
        // Friction
        this.vx *= 0.98;
        this.vy *= 0.98;

        // Mouse attraction
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distSq = dx * dx + dy * dy;
        const dist = Math.sqrt(distSq);

        if (dist < 400 && dist > 1) {
            const force = (400 - dist) / 400;
            this.vx += (dx / dist) * force * 0.5;
            this.vy += (dy / dist) * force * 0.5;
        }

        // Apply velocity
        this.x += this.vx;
        this.y += this.vy;

        // Life cycle
        if (lifeToggle.checked) {
            this.life--;
            if (this.life <= 0) {
                this.init();
                // Respawn at a distance from mouse to make it look like they are flowing in
                const angle = Math.random() * Math.PI * 2;
                const r = Math.random() * 200 + 300;
                this.x = mouse.x + Math.cos(angle) * r;
                this.y = mouse.y + Math.sin(angle) * r;
            }
        } else {
            // Keep life full if toggle is off
            this.life = this.maxLife;
            
            // Boundary bounce if no life cycle
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;
        }
    }

    draw() {
        const opacity = this.life / this.maxLife;
        ctx.fillStyle = `hsl(${globalHue + this.hueOffset}, 100%, 60%)`;
        ctx.globalAlpha = opacity;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

// Initialize particles
function init() {
    particles = [];
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
}

init();

function animate() {
    globalHue += 0.2;
    if (globalHue > 360) globalHue = 0;

    // Semi-transparent clear for trails
    ctx.fillStyle = 'rgba(10, 10, 10, 0.15)';
    ctx.fillRect(0, 0, width, height);

    particles.forEach(p => {
        p.update();
        p.draw();
    });

    requestAnimationFrame(animate);
}

animate();
