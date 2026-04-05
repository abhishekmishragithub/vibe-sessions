# Vibe Sessions with Ninja

A collection of creative browser-based experiments.

## Projects

### Scribble Segmentation

Real-time webcam person segmentation where your hand-drawn scribble becomes the texture of your silhouette. Draw a pattern, and it tiles across your body shape — animated, looping endlessly.

**[Live Demo](https://abhishekmishragithub.github.io/vibe-sessions/scribble-segmentation/)**

#### How it works

1. Webcam captures your live feed
2. MediaPipe Selfie Segmentation extracts your silhouette in real-time
3. You draw strokes on a canvas — velocity affects line thickness
4. Your scribble is tiled as a repeating pattern and clipped to your person mask
5. The drawing animation replays in an endless loop inside your silhouette

#### Controls

- **Left-click drag** on the drawing canvas to draw
- **Right-click** on the drawing canvas to clear
- **Brush slider** below the output to adjust stroke thickness (1–30px)

#### Architecture

```
scribble-segmentation/
├── index.html          # HTML shell, CDN deps, module entry
├── css/
│   └── style.css       # Layout and styling
└── js/
    ├── app.js          # Init MediaPipe + Camera, wiring
    ├── state.js        # Shared state, canvas refs, helpers
    ├── drawing.js      # Stroke recording, mouse handlers
    ├── animation.js    # Replay timeline, tiled pattern rendering
    └── compositing.js  # Alpha mask conversion, per-frame pipeline
```

#### Tech

- [MediaPipe Selfie Segmentation](https://github.com/google-ai-edge/mediapipe) — real-time person masking via WASM
- Canvas 2D compositing (`source-in`) for silhouette clipping
- `createPattern('repeat')` for tiling scribble across the mask
- ES modules, no build tools

## Setup

### Run locally

```bash
git clone git@github.com:abhishekmishragithub/vibe-sessions.git
cd vibe-sessions/scribble-segmentation
npx serve .
```

Open `http://localhost:3000` in Chrome. Grant camera access when prompted.

> **Note:** Must be served over HTTP (not `file://`) because MediaPipe loads WASM binaries that require an HTTP origin. Any static server works — `npx serve`, `python3 -m http.server`, VS Code Live Server, etc.

### Deploy to GitHub Pages

1. Go to repo **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Save — site will be live at `https://abhishekmishragithub.github.io/vibe-sessions/scribble-segmentation/`

### Browser support

Chrome 91+, Firefox 89+, Safari 16.4+ (requires WebAssembly SIMD)
