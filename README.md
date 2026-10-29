# Photonic XR

Your laptop screen becomes a window and your hands reach through it. No headset, just a webcam and a few small AI models running in the browser.

> **Privacy:** hand and face tracking run locally in your browser (MediaPipe). No video is recorded, stored or sent anywhere.

## The four experiences

**Photo Galaxy.** Your photos float in a 3D room behind the glass. Each one is a real 3D surface built from an AI depth map, so faces bulge forward and backgrounds fall away. An image AI (CLIP) groups photos that look alike, so they cluster together in space.

- Pinch to grab a photo, move your hand closer or further to push it deeper or pull it near
- Quick pinch (or push toward the screen) opens a photo in front of the glass, then lean your head to look around its depth
- Fling to throw, hold a fist over a photo to burn it (press `U` to bring it back)
- Two hands: stretch and twist a held photo, or pull apart on empty space to fly into the galaxy
- **Sort** mode: the AI drops each photo into a ring (Portraits, Crew, Places, Dogs, Art). Throw a photo into a different ring to correct it.

**Light Sculptor.** Pinch to draw glowing strokes in real 3D. Hand distance sets the depth. Pinch with your other hand to turn the sculpture, push to undo, hold a fist to clear. Mirror mode draws symmetrically.

**Air Theremin.** Pinch with your right hand to play: its height picks the note, pushing in makes it brighter, an open hand adds vibrato. Your left hand's height sets volume and its finger count picks the wave shape. Notes snap to a pentatonic scale unless you switch to free pitch.

**Splat Worlds.** Real objects and places captured as Gaussian splats (millions of soft, coloured blobs of light), rendered with [Spark](https://sparkjs.dev) inside the same window. Six objects (butterfly, penguin, cat, robot head, dessert, a burger) and four walk-in worlds (painted bedroom, fireplace, distant igloo, valley).

- Pinch and drag to turn an object, or to look around a world. Let go mid-swing and it keeps turning
- Two hands: spread to zoom (objects) or walk in (worlds), twist to roll
- Push toward the screen to bring an object up to the glass or step into a world; pinch and move your hand closer to fly smoothly
- Swipe an open hand sideways for the next world, or pinch a name in the carousel
- **Portal** (`P`): the room goes black and a lit frame sits on the glass. Anything behind the glass is cut off at the frame, and anything you pull forward draws over it, so it looks like it is coming out of the screen
- Mouse: drag = turn, scroll = fly, `Space` = step in, `Shift`+drag = zoom/roll, `←` `→` = next, `R` = reset

The scenes are World Labs' public Spark samples. Download them once so demos never depend on the network (about 40 MB, into git-ignored `public/splats/`):

```bash
npm run splats
```

Missing files load straight from sparkjs.dev instead. The list lives in `src/demos/splatScenes.json`. Your own splats (for example made from your photos with Apple SHARP) go in `public/local/splats/` with a `manifest.json` (`{ "scenes": [{ "id", "name", "kind": "object" | "world", "file", "line" }] }`) and are appended to the carousel; like everything in `public/local/`, they never get pushed.

## What makes the 3D work

- **Head-coupled perspective.** Face tracking finds your eyes, and the camera uses an off-axis projection (the Johnny Lee Wii trick). The screen edges stay fixed like a window frame while the room behind shifts as you move.
- **Depth from one photo.** `scripts/prepare_photos.py` runs Depth Anything V2 on every photo ahead of time. The browser only has to run hand and face tracking, which keeps a fanless laptop cool.
- **Gestures that hold up.** Pinch and fist thresholds scale with how big your hand looks on camera and use two thresholds (hysteresis), so they don't flicker. Cursors use a One Euro filter: steady when still, quick when moving.
- **Steady 60 fps with splats.** Spark's level-of-detail caps how many splats are drawn (900k for objects, 350k for worlds), splats render at pixel ratio 1 (0.7 inside worlds) with a trimmed falloff, and the renderer has no MSAA, which alone took a splat scene from 12 to 60 fps. Spark itself only downloads when you open Splat Worlds.
- **Spatial sound.** Every sound is synthesised live with Web Audio and placed in 3D with HRTF panning.

## Running it

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, then choose **Enable camera** (or **Use mouse instead**).

Mouse mode: click = pinch, scroll = depth, hold `F` = fist, hold `Shift` = second mirrored hand, `Space` = push. Press `D` anywhere for the tracking debug view, `Esc` to go back.

## Using your own photos

Photos in `public/local/` are git-ignored, so personal pictures never get pushed.

1. Put JPGs in `public/local/src/`
2. Run `python3 scripts/prepare_photos.py` (needs `torch`, `transformers`, `pillow`; uses the Apple GPU when it's there)
3. Reload. The app uses `public/local` when it exists and falls back to the dog photos in `public/demo` otherwise.

`python3 scripts/prepare_photos.py --set demo` rebuilds the bundled dog set.

## Tech

React 19 + Vite, three.js (CSS2D labels, fat lines), Spark (Gaussian splats), MediaPipe Tasks Vision (hand + face landmarker), Web Audio. The engine lives in `src/engine`, each experience in `src/demos`, the overlay UI in `src/ui`.

Made by **SpaceMan619**.
