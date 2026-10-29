import { OneEuro, OneEuro3, clamp, remap } from './filters';

// Landmark indices (MediaPipe hand model)
const WRIST = 0, THUMB_IP = 3, THUMB_TIP = 4, INDEX_MCP = 5, MIDDLE_MCP = 9, PINKY_MCP = 17;
const TIPS = [8, 12, 16, 20];
const PIPS = [6, 10, 14, 18];

// Pinch uses two thresholds so it never flickers on the boundary (hysteresis).
// Distances are divided by hand size, so they work near or far from the camera.
const PINCH_ON = 0.3;
const PINCH_OFF = 0.45;
const LOST_GRACE = 0.18; // seconds a hand may vanish before we drop it

// Only the middle of the camera frame maps to the screen, so you never
// have to reach to the very edge of the camera's view.
const CROP_X = [0.12, 0.88];
const CROP_Y = [0.08, 0.78];

function makeHand(slot) {
    return {
        slot,
        present: false,
        x: 0.5, y: 0.5, z: 0,          // screen space 0..1, z = push depth -1..1
        vx: 0, vy: 0, vz: 0,
        size: 0,
        pinch: false,
        pinchStrength: 0,
        fist: false,
        fistSince: 0,
        fingers: 0,
        pushCount: 0,
        lastPush: 0,
        lastSeen: -1,
        landmarks: new Float32Array(21 * 3), // mapped to screen space
        _fx: new OneEuro(1.4, 3.5), _fy: new OneEuro(1.4, 3.5), _fz: new OneEuro(0.8, 1.0),
        _baseline: 0,
        _prev: null,
    };
}

function resetHand(h) {
    h.present = false;
    h.pinch = false;
    h.fist = false;
    h.fistSince = 0;
    h._fx.reset(); h._fy.reset(); h._fz.reset();
    h._prev = null;
}

export class Tracker {
    constructor() {
        this.mode = 'none';
        this.hands = [makeHand(0), makeHand(1)];
        this.head = { x: 0, y: 0, d: 1, present: false };
        this.video = null;
        this.stats = { fps: 0, handMs: 0, faceMs: 0 };
        this._headF = new OneEuro3(0.9, 0.6);
        this._frame = 0;
        this._fpsCount = 0;
        this._fpsT = performance.now();
        this._mouse = null;
    }

    now() { return performance.now() / 1000; }

    // ---------- Camera mode ----------
    async startCamera() {
        // 640x480 is plenty for landmarks and keeps the Air cool.
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 640, height: 480, facingMode: 'user' },
        });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        this.video = video;

        // The AI models run in a worker so rendering never waits on them.
        const worker = (this.worker = new Worker(new URL('./trackWorker.js', import.meta.url), { type: 'module' }));
        await new Promise((resolve, reject) => {
            worker.onmessage = (e) => {
                if (e.data.type === 'ready') resolve();
                else if (e.data.type === 'error') reject(new Error(e.data.message));
            };
            worker.onerror = (e) => reject(new Error(e.message));
            worker.postMessage({ type: 'init', origin: location.origin });
        });
        worker.onmessage = (e) => this._onResult(e.data);

        this.mode = 'camera';
        this._running = true;
        this._busy = false;
        const loop = () => {
            if (!this._running) return;
            this._sendFrame();
            video.requestVideoFrameCallback(loop);
        };
        video.requestVideoFrameCallback(loop);
    }

    async _sendFrame() {
        const video = this.video;
        // One frame in flight at a time; if the worker is still busy we skip this camera frame.
        if (this._busy || !video.videoWidth || document.hidden) return;
        this._busy = true;
        try {
            const bitmap = await createImageBitmap(video);
            const doFace = this._frame++ % 3 === 0; // the head moves slowly, the filter fills the gaps
            this.worker.postMessage({ type: 'frame', bitmap, t: performance.now(), doFace }, [bitmap]);
        } catch {
            this._busy = false;
        }
    }

    _onResult(r) {
        if (r.type !== 'result') return;
        this._busy = false;
        const t = performance.now() / 1000;
        const aspect = this.video.videoWidth / this.video.videoHeight;
        this._updateHands(r.hands, t, aspect);
        if (r.doFace) this._updateHead(r.iris, t, aspect);
        this.lastResult = r;

        this.stats.handMs += (r.handMs - this.stats.handMs) * 0.1;
        if (r.doFace) this.stats.faceMs += (r.faceMs - this.stats.faceMs) * 0.2;
        this._fpsCount++;
        const now = performance.now();
        if (now - this._fpsT > 1000) {
            this.stats.fps = this._fpsCount;
            this._fpsCount = 0;
            this._fpsT = now;
        }
    }

    _updateHands(list, t, aspect) {
        // Screen position of each detected hand, for matching to stable slots.
        const found = list.map((lm) => ({
            lm,
            sx: remap(1 - (lm[INDEX_MCP].x + lm[WRIST].x) / 2, CROP_X[0], CROP_X[1], 0, 1),
            sy: remap((lm[INDEX_MCP].y + lm[WRIST].y) / 2, CROP_Y[0], CROP_Y[1], 0, 1),
        }));

        // Keep each physical hand in the same slot so a grab never jumps hands.
        const assigned = [null, null];
        const free = [];
        for (const f of found) {
            let best = -1, bestD = 0.35;
            for (const h of this.hands) {
                if (!h.present || assigned[h.slot]) continue;
                const d = Math.hypot(h.x - f.sx, h.y - f.sy);
                if (d < bestD) { bestD = d; best = h.slot; }
            }
            if (best >= 0) assigned[best] = f; else free.push(f);
        }
        for (const f of free) {
            const slot = assigned[0] === null && !this.hands[0].present ? 0
                : assigned[1] === null && !this.hands[1].present ? 1
                    : assigned[0] === null ? 0 : assigned[1] === null ? 1 : -1;
            if (slot >= 0) assigned[slot] = f;
        }

        for (const h of this.hands) {
            const f = assigned[h.slot];
            if (f) this._updateHand(h, f.lm, t, aspect);
            else if (h.present && t - h.lastSeen > LOST_GRACE) resetHand(h);
        }
    }

    _updateHand(h, lm, t, aspect) {
        const ys = 1 / aspect; // convert y to width units
        const d3 = (a, b) => Math.hypot(lm[a].x - lm[b].x, (lm[a].y - lm[b].y) * ys, lm[a].z - lm[b].z);

        const size = (d3(WRIST, MIDDLE_MCP) + d3(INDEX_MCP, PINKY_MCP) * 1.35) / 2;
        if (!h.present) h._baseline = size;
        // Slowly adapt "neutral" depth so the user can settle anywhere.
        h._baseline += (size - h._baseline) * 0.004;

        // Cursor anchor: between the index knuckle and the pinch point.
        // Knuckles don't move when you pinch, so the cursor stays put on click.
        const ax = (lm[INDEX_MCP].x + (lm[THUMB_TIP].x + lm[8].x) / 2) / 2;
        const ay = (lm[INDEX_MCP].y + (lm[THUMB_TIP].y + lm[8].y) / 2) / 2;
        const rawX = remap(1 - ax, CROP_X[0], CROP_X[1], 0, 1);
        const rawY = remap(ay, CROP_Y[0], CROP_Y[1], 0, 1);
        const rawZ = clamp(Math.log(size / h._baseline) / Math.log(1.7), -1, 1);

        const x = clamp(h._fx.filter(rawX, t), -0.05, 1.05);
        const y = clamp(h._fy.filter(rawY, t), -0.05, 1.05);
        const z = h._fz.filter(rawZ, t);

        if (h._prev) {
            const dt = Math.max(1e-3, t - h._prev.t);
            const k = 0.5;
            h.vx += ((x - h._prev.x) / dt - h.vx) * k;
            h.vy += ((y - h._prev.y) / dt - h.vy) * k;
            h.vz += ((z - h._prev.z) / dt - h.vz) * k;
        }
        h._prev = { x, y, z, t };
        h.x = x; h.y = y; h.z = z; h.size = size;

        // Fingers: a finger is curled when its tip is closer to the wrist than its middle joint.
        let curled = 0, extended = 0;
        for (let i = 0; i < 4; i++) {
            const tip = d3(TIPS[i], WRIST), pip = d3(PIPS[i], WRIST);
            if (tip < pip) curled++;
            else if (tip > pip * 1.12) extended++;
        }
        const thumbOut = d3(THUMB_TIP, PINKY_MCP) > d3(THUMB_IP, PINKY_MCP) * 1.12;
        h.fingers = extended + (thumbOut ? 1 : 0);

        const pd = d3(THUMB_TIP, 8) / size;
        h.pinchStrength = clamp(1 - (pd - 0.18) / (0.7 - 0.18), 0, 1);
        const fist = curled === 4;
        if (fist) {
            h.pinch = false;
            if (!h.fist) h.fistSince = t;
        } else {
            h.pinch = h.pinch ? pd < PINCH_OFF : pd < PINCH_ON;
        }
        h.fist = fist;

        // Push: a quick move toward the screen.
        if (h.vz > 2.2 && z > 0.12 && t - h.lastPush > 0.7 && !h.pinch) {
            h.pushCount++;
            h.lastPush = t;
        }

        for (let i = 0; i < 21; i++) {
            h.landmarks[i * 3] = remap(1 - lm[i].x, CROP_X[0], CROP_X[1], 0, 1);
            h.landmarks[i * 3 + 1] = remap(lm[i].y, CROP_Y[0], CROP_Y[1], 0, 1);
            h.landmarks[i * 3 + 2] = lm[i].z / size; // depth relative to wrist, in hand units
        }
        h.present = true;
        h.lastSeen = t;
    }

    _updateHead(iris, t, aspect) {
        if (!iris) {
            this.head.present = false;
            return;
        }
        const [a, b] = iris; // iris centres
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const eyes = Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
        // ~0.09 of frame width is a typical eye gap at ~55 cm on a laptop webcam.
        const d = clamp(0.09 / Math.max(eyes, 1e-3), 0.45, 2.2);
        const [x, y, dd] = this._headF.filter([(0.5 - mx) * 2, (0.5 - my) * 2, d], t);
        Object.assign(this.head, { x, y, d: dd, present: true });
    }

    // ---------- Mouse mode (no camera, also used for testing) ----------
    startMouse() {
        this.mode = 'mouse';
        const h = this.hands[0], h2 = this.hands[1];
        const m = (this._mouse = { x: 0.5, y: 0.5, down: false, shift: false, fist: false, z: 0 });
        const t = () => this.now();
        const sync = () => {
            const now = t();
            for (const hand of [h, h2]) {
                const mirror = hand === h2;
                if (mirror && !m.shift) { hand.present = false; hand.pinch = false; continue; }
                const nx = mirror ? 1 - m.x : m.x;
                if (hand._prev) {
                    const dt = Math.max(1e-3, now - hand._prev.t);
                    hand.vx += ((nx - hand._prev.x) / dt - hand.vx) * 0.5;
                    hand.vy += ((m.y - hand._prev.y) / dt - hand.vy) * 0.5;
                }
                hand._prev = { x: nx, y: m.y, z: m.z, t: now };
                hand.present = true;
                hand.lastSeen = now;
                hand.x = nx; hand.y = m.y; hand.z = m.z;
                hand.pinch = m.down && !m.fist;
                hand.pinchStrength = m.down ? 1 : 0;
                if (m.fist && !hand.fist) hand.fistSince = now;
                hand.fist = m.fist;
                hand.fingers = m.fist ? 0 : m.down ? 2 : 5;
                fakeLandmarks(hand);
            }
        };
        const on = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); this._off.push(() => el.removeEventListener(ev, fn, opt)); };
        this._off = [];
        on(window, 'pointermove', (e) => { m.x = e.clientX / innerWidth; m.y = e.clientY / innerHeight; m.shift = e.shiftKey; sync(); });
        on(window, 'pointerdown', (e) => {
            if (e.button !== 0) return;
            m.x = e.clientX / innerWidth; m.y = e.clientY / innerHeight;
            m.down = true; sync();
        });
        // Hold the "pinch" for a moment so even an instant click lasts at least one frame.
        on(window, 'pointerup', () => setTimeout(() => { m.down = false; sync(); }, 60));
        on(window, 'wheel', (e) => { m.z = clamp(m.z - e.deltaY * 0.0015, -1, 1); sync(); }, { passive: true });
        on(window, 'keydown', (e) => {
            if (e.key === 'f' && !m.fist) { m.fist = true; sync(); }
            if (e.key === 'Shift') { m.shift = true; sync(); }
            if (e.code === 'Space') { h.pushCount++; e.preventDefault(); }
        });
        on(window, 'keyup', (e) => {
            if (e.key === 'f') { m.fist = false; sync(); }
            if (e.key === 'Shift') { m.shift = false; sync(); }
        });
        // Velocity decays when the mouse stops, like a real hand coming to rest.
        this._mouseDecay = setInterval(() => {
            for (const hand of [h, h2]) {
                if (hand._prev && t() - hand._prev.t > 0.05) { hand.vx *= 0.6; hand.vy *= 0.6; }
            }
        }, 50);
    }

    // Head position in mouse mode: follow the pointer a little so the window effect still shows.
    tickMouseHead(dt) {
        if (this.mode !== 'mouse' || !this._mouse) return;
        const k = 1 - Math.exp(-3 * dt);
        this.head.x += ((0.5 - this._mouse.x) * -0.9 - this.head.x) * k;
        this.head.y += ((0.5 - this._mouse.y) * 0.6 - this.head.y) * k;
        this.head.present = true;
    }

    stop() {
        this._running = false;
        this.video?.srcObject?.getTracks().forEach((tr) => tr.stop());
        this.worker?.terminate();
        this._off?.forEach((f) => f());
        clearInterval(this._mouseDecay);
    }
}

// A flat, open hand drawn around the mouse so the hand visual has something to show.
const FAKE = [
    [0, 0.12], [-0.05, 0.08], [-0.09, 0.04], [-0.12, 0.0], [-0.14, -0.03],
    [-0.04, -0.02], [-0.05, -0.08], [-0.055, -0.12], [-0.06, -0.15],
    [0, -0.03], [0, -0.1], [0, -0.14], [0, -0.17],
    [0.035, -0.02], [0.04, -0.08], [0.045, -0.12], [0.05, -0.15],
    [0.065, 0.0], [0.075, -0.05], [0.08, -0.08], [0.085, -0.11],
];
function fakeLandmarks(h) {
    const s = h.pinch ? 0.7 : h.fist ? 0.45 : 1;
    const ar = innerWidth / innerHeight;
    for (let i = 0; i < 21; i++) {
        let [fx, fy] = FAKE[i];
        if (h.pinch && (i === 4 || i === 8)) { fx = -0.07; fy = -0.06; }
        h.landmarks[i * 3] = h.x + (fx * s) / ar;
        h.landmarks[i * 3 + 1] = h.y + 0.06 + fy * s;
        h.landmarks[i * 3 + 2] = 0;
    }
}
