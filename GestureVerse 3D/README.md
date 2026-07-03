# AETHER — Gesture-Controlled Holographic 3D Interface

A working, dark-futuristic (JARVIS-style) site where you spawn and manipulate
3D objects using webcam hand gestures — MediaPipe Hands + Three.js + GSAP,
zero build step required.

## Run it
Just open `index.html` from a local web server (webcam access requires
`http://localhost` or `https://`, not `file://`):

```bash
npx serve .
# or
python3 -m http.server 8080
```
Then visit the printed URL and click **Start Camera**. Allow webcam access.

## What's real in this build
- **Live hand tracking**: MediaPipe Hands, both hands, 21 landmarks each, drawn as a skeleton overlay, with a confidence bar and smoothing.
- **Heuristic gesture recognizer** for all 11 gestures in the brief (open palm, fist, thumbs up/down, two/three/five fingers, OK, pinch, two-hand, clap), with debouncing so gestures don't fire every frame.
- **24 procedurally-built 3D objects** across all 6 requested categories (Nature, Fantasy, Space, Science, Energy, Luxury), using `MeshPhysicalMaterial` (metalness, roughness, transmission/glass, clearcoat) for real PBR look, shadows, and idle animation per object type (spin, hover, pulse, flutter, fire, electric, atom-orbit…).
- **Three.js pipeline**: bloom (UnrealBloomPass), a procedural PMREM environment for reflections (no external HDR download needed), a real-time mirror floor (`Reflector`), a lens flare on the key light, additive-blended particle fire/spark/explosion/dust systems, and a JARVIS cyan/violet two-light rig.
- **Full UI chrome**: animated hero, live FPS/camera/hand-detection HUD, glassmorphic dock + side panels, object gallery with search/category filters/favorites, settings (bloom, particle density, gesture sensitivity, shadow quality, object quality, camera resolution, background mode, accent theme, mirror mode, physics toggle), gesture lexicon modal, toast notifications, screenshot capture + thumbnail strip, and a basic voice-command mode (Web Speech API, e.g. "spawn dragon", "reset", "screenshot").
- **Custom model upload**: drop a `.glb`/`.gltf` in Settings to load a real photoreal asset alongside the procedural ones.
- **Basic PWA**: `manifest.json` + `sw.js` cache the app shell for offline reopening (the CDN libraries still need a network hit on first load).

## What's simplified, and why
The original brief describes a multi-week production (50+ licensed
photoreal PBR asset downloads, a trained ML gesture classifier, full
volumetric lighting/motion blur/depth-of-field passes, gesture record &
replay, AI semantic object search, background music licensing, etc.). To
hand you something that actually runs the moment you open it, this build:

- Uses **procedural geometry instead of downloaded GLB assets** for the
  default library — this avoids 50 external asset fetches that could 404,
  license issues, and multi-hundred-MB downloads. Swap in real files any
  time via the upload panel or by editing `Factory` in `app.js`.
- Uses a **heuristic (not ML-trained) gesture classifier** — reliable for
  clearly-formed gestures in decent lighting, but it isn't a trained model
  and can misfire in edge cases the way any landmark-angle heuristic can.
- Implements **bloom + lens flare + a reflective floor**, but skips a full
  depth-of-field (Bokeh) pass and true volumetric light shafts to keep the
  frame budget closer to 60fps on mid-range laptops.
- **Gesture recording/replay** and **AI semantic object search** aren't
  included — the architecture (an `activeObjects` array + a single
  `applyGestureAction` dispatcher) is set up so both would be a
  straightforward addition (record: log `(timestamp, gesture, handedness)`
  tuples; replay: feed them back through `applyGestureAction` on a timer).

## Porting to a Vite + npm project
Everything here is plain ES modules loaded via `<script type="importmap">`,
so moving it into a Vite project is mostly mechanical:
```bash
npm create vite@latest aether -- --template vanilla
npm i three gsap @mediapipe/hands @mediapipe/camera_utils @mediapipe/drawing_utils
```
then swap the CDN `<script>` tags for `import` statements and drop
`index.html` / `app.js` into `src/`.
