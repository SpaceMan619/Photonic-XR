import * as THREE from 'three';
import { ui, toast, coachDone } from '../engine/store';
import { audio } from '../engine/audio';
import { damp, clamp } from '../engine/filters';
import { THEME, color } from '../engine/theme';
import BUILT_IN from './splatScenes.json';

// What holds 60 fps on the Air, measured per kind (Chrome, 1470x850 @2x). Splats are pure blended fill:
// ratio = render pixel ratio (soft splats don't need retina), budget = most splats Spark's LoD may draw,
// px = biggest a single splat may get on screen (walking into a world puts splats right at your eye).
const PERF = {
    object: { ratio: 1, budget: 900_000, px: 160 },
    world: { ratio: 0.7, budget: 350_000, px: 80 },
};
const PORTAL_INSET = 0.07;       // portal frame inset, as a share of screen height

const OBJECT_Z = -1.25;          // objects rest just behind the glass
const OBJECT_SIZE = 1.45;        // fitted height/width, in half-screen-heights
const WORLD_Z = -2.4;            // a world starts as a diorama deep behind the glass...
const WORLD_SIZE = 5.5;          // ...wider than the window, so it reads as a place
const APPROACH = { object: [-1.6, 1.15], world: [-1.6, 1.9] }; // how far each can come toward you
const LOAD_TIMEOUT = 25_000;
const REVEAL_TIME = 1.7;
const VANISH_TIME = 0.8;
const IDLE_AFTER = 3;
const FLIP = new THREE.Quaternion(1, 0, 0, 0); // most captures are y-down / z-forward (OpenCV)

// Splat Worlds: Gaussian splat objects you turn in your hands, and scenes you step into.
// Spark (World Labs) renders the splats inside the same three.js scene and off-axis camera
// as the rest of Photonic, so head tracking keeps the "window" effect for free.
export class SplatsDemo {
    constructor(stage) {
        this.stage = stage;
        this.index = -1;
        this.cur = null;         // the shown scene: { scene, mesh, root, inner, fx, home, kind, ... }
        this.leaving = [];
        this.token = 0;
        this.view = makeView();
        this.goal = makeView();
        this.spin = 0;
        this.drag = [null, null];
        this.two = null;
        this.lastZ = [0, 0];
        this.pinchEnd = [0, 0];
        this.lastSwipe = 0;
        this.lastInput = 0;
        this.idle = 0;
        this._q = new THREE.Quaternion();
        this._v = new THREE.Vector3();
        this.onKey = (e) => {
            if (e.key === 'ArrowRight') this.step(1);
            if (e.key === 'ArrowLeft') this.step(-1);
            if (e.key === 'r') this.resetView();
            if (e.key === 'p') ui.set({ splatPortal: !ui.get().splatPortal });
        };
        window.addEventListener('keydown', this.onKey);
    }

    async init() {
        // Spark is ~3 MB (it carries its own WebAssembly), so it only loads when you open this experience.
        const spark = (this.lib = await import('@sparkjsdev/spark'));
        if (this.disposed) return;
        this.prevRatio = this.stage.renderer.getPixelRatio();
        // maxStdDev √5 trims each splat's faint outer skirt: invisible, and ~25% less fill than the default √8.
        this.spark = new spark.SparkRenderer({ renderer: this.stage.renderer, maxStdDev: Math.sqrt(5) });
        this.stage.scene.add(this.spark);
        this.applyPerf('object');

        this.scenes = BUILT_IN.scenes.map((s) => ({ ...s, sources: [`/splats/${s.file}`, s.url] }));
        // Your own splats (for example made from your photos with SHARP) can be listed in
        // public/local/splats/manifest.json, which is git-ignored like the rest of public/local.
        try {
            const r = await fetch('/local/splats/manifest.json');
            const j = JSON.parse(await r.text());
            for (const s of j.scenes || []) {
                this.scenes.push({ kind: 'object', ...s, id: `local-${s.id || s.file}`, sources: [`/local/splats/${s.file}`], local: true });
            }
        } catch { /* no local splats */ }
        if (this.disposed) return;

        this.unsub = ui.subscribe((s) => {
            if (s.splatIndex !== this.index) this.show(s.splatIndex);
            if (s.splatPortal !== this.portalOn) this.setPortal(s.splatPortal);
        });
        this.setPortal(ui.get().splatPortal);
        ui.set({ splatList: this.scenes.map(({ id, name, kind, line, local }) => ({ id, name, kind, line, local })) });
        this.show(clamp(ui.get().splatIndex || 0, 0, this.scenes.length - 1));
    }

    resize() {
        if (this.portal) this.buildPortal();
    }

    applyPerf(kind) {
        const p = PERF[kind], r = this.stage.renderer;
        const ratio = Math.min(window.devicePixelRatio, p.ratio);
        this.spark.lodSplatCount = p.budget;
        this.spark.maxPixelRadius = p.px;
        if (r.getPixelRatio() !== ratio) {
            r.setPixelRatio(ratio);
            this.stage.resize();
        }
    }

    // ---------- portal ----------
    // Portal mode: the room and sky go black and a thin lit frame sits on the glass. A black mat around
    // the frame writes depth at the screen plane, so anything behind the glass is cut off at the frame
    // while anything you pull in front of it draws over the frame: it looks like it's coming out of the screen.
    setPortal(on) {
        on = !!on;
        this.portalOn = on;
        const st = this.stage;
        st.sky.visible = st.dust.visible = st.roomGroup.visible = !on;
        st.renderer.setClearColor(on ? 0x000000 : THEME.bg, 1);
        if (on && !this.portal) this.buildPortal();
        if (this.portal) this.portal.visible = on;
    }

    buildPortal() {
        const st = this.stage;
        if (this.portal) {
            st.scene.remove(this.portal);
            this.portal.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        }
        const W = st.W, H = st.H, m = H * PORTAL_INSET;
        const w = W / 2 - m, h = H / 2 - m;
        const rect = (hw, hh) => {
            const sh = new THREE.Shape();
            sh.moveTo(-hw, -hh); sh.lineTo(hw, -hh); sh.lineTo(hw, hh); sh.lineTo(-hw, hh); sh.closePath();
            return sh;
        };
        const ring = (outerW, outerH, innerW, innerH) => {
            const sh = rect(outerW, outerH);
            sh.holes.push(rect(innerW, innerH));
            return new THREE.ShapeGeometry(sh);
        };
        const g = (this.portal = new THREE.Group());
        const mat = new THREE.Mesh(ring(W * 2, H * 2, w, h), new THREE.MeshBasicMaterial({ color: 0x000000 }));
        const line = new THREE.Mesh(ring(w + 0.012, h + 0.012, w, h), new THREE.MeshBasicMaterial({ color: 0xdfe7ff }));
        // A faint periwinkle halo just outside the line, so the frame reads as lit glass, not a box.
        const halo = new THREE.Mesh(ring(w + 0.07, h + 0.07, w + 0.012, h + 0.012), new THREE.MeshBasicMaterial({
            color: color(THEME.sky), transparent: true, opacity: 0.18, depthWrite: false }));
        mat.renderOrder = -50; line.renderOrder = -49; halo.renderOrder = -48;
        g.add(mat, line, halo);
        g.visible = this.portalOn;
        st.scene.add(g);
    }

    step(dir) {
        if (!this.scenes) return;
        const n = this.scenes.length;
        ui.set({ splatIndex: (this.index + dir + n) % n });
    }

    // ---------- loading ----------
    async show(i) {
        if (i === this.index || !this.scenes?.[i]) return;
        if (this.index >= 0) coachDone('next');
        this.index = i;
        ui.set({ splatIndex: i });
        const scene = this.scenes[i];
        const token = ++this.token;
        this.abort?.abort();
        const abort = (this.abort = new AbortController());

        // The old scene drifts away like dandelion seeds while the new one loads.
        if (this.cur) {
            this.cur.state = 'out';
            this.cur.t = 0;
            this.leaving.push(this.cur);
            this.cur = null;
            audio.whoosh(new THREE.Vector3(0, 0, -1), 0.6);
        }
        ui.set({ splatStatus: 'loading', splatProgress: 0, splatCount: 0 });

        let mesh;
        try {
            const bytes = await fetchBytes(scene.sources, abort.signal, (p) => {
                if (token === this.token) ui.set({ splatProgress: Math.round(p * 85) });
            });
            if (token !== this.token) return;
            ui.set({ splatProgress: 88 });
            // ext: full-precision positions, for captures that sit far from the origin (half floats can't hold them).
            // lod: false skips Spark's LoD build for files it can't build one for (see splatScenes.json).
            mesh = new this.lib.SplatMesh({ fileBytes: bytes, fileName: scene.file, extSplats: !!scene.ext, lod: scene.lod !== false });
            await Promise.race([mesh.initialized, new Promise((_, no) => setTimeout(() => no(new Error('Splat decode timed out')), LOAD_TIMEOUT))]);
        } catch (e) {
            mesh?.dispose();
            if (e.name === 'AbortError' || token !== this.token) return;
            console.error(e);
            ui.set({ splatStatus: 'error' });
            toast(`Couldn't load ${scene.name}`);
            return;
        }
        if (token !== this.token || this.disposed) { mesh.dispose(); return; }
        this.place(scene, mesh);
        ui.set({ splatStatus: 'ready', splatProgress: 100, splatCount: splatSource(mesh)?.numSplats || 0 });
        audio.chime(null, scene.kind === 'world' ? 349.23 : 392);
    }

    place(scene, mesh) {
        const kind = scene.kind === 'world' ? 'world' : 'object';
        const { center, extent, radius } = measure(mesh);
        const flip = scene.flip === false ? new THREE.Quaternion() : FLIP;
        mesh.quaternion.copy(flip);
        const inner = new THREE.Group();
        const root = new THREE.Group();
        inner.add(mesh);
        root.add(inner);
        this.stage.scene.add(root);

        // "home" is the resting view: which scene point sits on the pivot, how big, which way round.
        // Both kinds are framed by their actual content, not their file origin (captures put that anywhere).
        const home = makeView();
        home.focus.copy(center).applyQuaternion(flip);
        home.base = (scene.size || (kind === 'object' ? OBJECT_SIZE : WORLD_SIZE)) / Math.max(extent, 1e-3);
        if (scene.focus) home.focus.add(this._v.fromArray(scene.focus));
        home.yaw = scene.yaw || 0;
        home.pitch = scene.pitch || 0;

        const fx = this.makeFx(mesh, center, radius, this._v.set(0, 1, 0).applyQuaternion(flip.clone().invert()).clone());
        this.cur = { scene, kind, mesh, root, inner, fx, home, radius: radius * home.base, state: 'in', t: 0 };

        // Arrive from a little turned and far away, then settle home (the view damps toward the goal).
        this.goal = cloneView(home);
        this.view = cloneView(home);
        if (kind === 'object') {
            this.view.yaw -= 0.9;
            this.view.zoom = 0.55;
            this.view.approach = -0.8;
        } else {
            this.view.approach = -1.4; // start a few steps back, then drift in
            this.view.yaw -= 0.35;
        }
        this.spin = 0;
        this.drag = [null, null];
        this.two = null;
        this.lastInput = this.stage.frame?.t ?? 0;
        this.stage.setRoomTint(kind === 'world' ? THEME.lilac : THEME.sky, kind === 'world' ? 0.12 : 0.9);
        this.applyPerf(kind);
        this.apply(this.cur, this.view, 0);
    }

    // A tiny GPU program run on every splat: a soft front of light sweeps out from the centre
    // when a scene arrives, and splats drift up and fade like seeds when it leaves.
    // (Adapted from Spark's splat-reveal-effects example.)
    makeFx(mesh, center, radius, up) {
        const { dyno } = this.lib;
        const reveal = dyno.dynoFloat(0), vanish = dyno.dynoFloat(0);
        const c = dyno.dynoVec3(center.clone()), r = dyno.dynoFloat(Math.max(radius, 1e-3)), u = dyno.dynoVec3(up);
        mesh.objectModifier = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
            const d = new dyno.Dyno({
                inTypes: { gsplat: dyno.Gsplat, reveal: 'float', vanish: 'float', c: 'vec3', r: 'float', up: 'vec3' },
                outTypes: { gsplat: dyno.Gsplat },
                globals: () => [dyno.unindent(/* glsl */`
                    vec3 swHash(vec3 p) {
                        p = fract(p * 0.3183099 + 0.1);
                        p *= 17.0;
                        return fract(vec3(p.x * p.y * p.z, p.x + p.y * p.z, p.x * p.y + p.z));
                    }
                `)],
                statements: ({ inputs, outputs }) => dyno.unindentLines(/* glsl */`
                    ${outputs.gsplat} = ${inputs.gsplat};
                    vec3 p = ${inputs.gsplat}.center;
                    vec3 h = swHash(p * 7.31);
                    float l = length(p - ${inputs.c}) / ${inputs.r};
                    float front = ${inputs.reveal} >= 1.0 ? 100.0 : ${inputs.reveal} * 1.6 - l - h.y * 0.08;
                    float shown = smoothstep(0.0, 0.22, front);
                    float rim = exp(-front * front * 60.0) * step(${inputs.reveal}, 0.999);
                    float v = clamp(${inputs.vanish} * 1.7 - h.x * 0.7, 0.0, 1.0);
                    vec3 dir = normalize(p - ${inputs.c} + (h - 0.5) * ${inputs.r} * 0.6);
                    ${outputs.gsplat}.center = p + (dir * 0.5 + ${inputs.up} * 0.9) * ${inputs.r} * v * v;
                    ${outputs.gsplat}.scales = ${inputs.gsplat}.scales * shown * (1.0 - v);
                    vec4 col = ${inputs.gsplat}.rgba;
                    col.rgb = mix(col.rgb, vec3(0.86, 0.91, 1.0), clamp(rim, 0.0, 1.0) * 0.85);
                    col.a *= clamp(shown + rim, 0.0, 1.0) * (1.0 - v);
                    ${outputs.gsplat}.rgba = col;
                `),
            });
            return { gsplat: d.apply({ gsplat, reveal, vanish, c, r, up: u }).gsplat };
        });
        mesh.updateGenerator();
        return { reveal, vanish };
    }

    // ---------- per frame ----------
    update(dt, t, frame) {
        const st = this.stage;
        st.cursorProgress[0] = st.cursorProgress[1] = 0;
        this.animateTransitions(dt);
        const c = this.cur;
        if (!c) return;

        const hands = frame.hands;
        const free = hands.map((h) => h.present && !h.captured);
        const mouse = st.tracker.mode === 'mouse';
        const isObj = c.kind === 'object';
        let active = false;

        // Two hands pinching: spread to zoom (objects) or walk (worlds), twist to roll.
        const both = free[0] && free[1] && hands[0].pinch && hands[1].pinch;
        if (both) {
            const [a, b] = hands;
            const dx = (b.x - a.x) * st.aspect, dy = b.y - a.y;
            const d = Math.max(0.02, Math.hypot(dx, dy));
            const ang = Math.atan2(-dy, dx);
            if (!this.two) {
                this.two = { d, ang, zoom: this.goal.zoom, roll: this.goal.roll, approach: this.goal.approach };
                this.drag = [null, null];
            }
            const g = this.two;
            const ratio = d / g.d;
            if (isObj) this.goal.zoom = clamp(g.zoom * ratio, 0.35, 4);
            else this.goal.approach = clampApproach(c, g.approach + Math.log(ratio) * 2.6);
            this.goal.roll = g.roll + wrap(ang - g.ang);
            if (Math.abs(ratio - 1) > 0.15) coachDone('zoom');
            active = true;
        } else this.two = null;

        hands.forEach((h, i) => {
            if (!free[i]) { this.drag[i] = null; this.lastZ[i] = h.z; return; }
            const dz = h.z - this.lastZ[i];
            this.lastZ[i] = h.z;

            // One hand pinch-drag: turn the object, or look around the world.
            if (h.pinch && !both && !this.drag[1 - i]) {
                if (!this.drag[i]) this.drag[i] = { x: h.x, y: h.y, yaw: this.goal.yaw, pitch: this.goal.pitch };
                const g = this.drag[i];
                this.goal.yaw = g.yaw + (h.x - g.x) * (isObj ? 4.2 : 2.2);
                this.goal.pitch = clamp(g.pitch + (h.y - g.y) * (isObj ? 3 : 1.6), isObj ? -1.2 : -0.55, isObj ? 1.2 : 0.55);
                this.spin = 0;
                if (Math.abs(h.x - g.x) + Math.abs(h.y - g.y) > 0.08) coachDone('orbit');
                active = true;
            } else if (this.drag[i]) {
                this.drag[i] = null;
                this.pinchEnd[i] = frame.t;
                // Let go mid-swing and it keeps turning.
                if (isObj && Math.abs(h.vx) > 0.3) this.spin = clamp(h.vx * 2.2, -4, 4);
            }

            // Hand closer (or the scroll wheel) flies in. With a camera only while pinching,
            // so ordinary hand movement doesn't drift the view.
            if ((mouse || h.pinch) && !both && Math.abs(dz) > 1e-4) {
                this.fly(dz * (mouse ? 1.6 : 2.2));
                active = true;
            }
            // A quick push toward the screen: bring the object up to the glass, or take a step in.
            if (h.pushed) {
                if (isObj) this.goal.approach = this.goal.approach > 0.6 ? 0 : 1.05;
                else this.goal.approach = this.goal.approach > 1.5 ? 0 : clampApproach(c, this.goal.approach + 0.9);
                audio.whoosh(new THREE.Vector3(0, 0, 0), 1.2);
                coachDone('fly');
                active = true;
            }
            // Open hand, fast sideways swipe: next / previous scene (camera only; a mouse moves this fast all the time).
            if (!mouse && !h.pinch && !h.ui && h.fingers >= 4 && Math.abs(h.vx) > 2.1 && Math.abs(h.vx) > Math.abs(h.vy) * 2
                && frame.t - this.lastSwipe > 1.1 && frame.t - this.pinchEnd[i] > 0.4) {
                this.lastSwipe = frame.t;
                this.step(h.vx < 0 ? 1 : -1);
            }
        });

        // Idle: objects slowly turn on their own, worlds sway a little, like breathing.
        if (active) this.lastInput = frame.t;
        const idleTarget = frame.t - this.lastInput > IDLE_AFTER ? 1 : 0;
        this.idle += (idleTarget - this.idle) * damp(idleTarget ? 0.6 : 6, dt);
        if (isObj) this.goal.yaw += (this.spin + 0.16 * this.idle) * dt;
        this.spin *= Math.exp(-1.6 * dt);
        if (!isObj && !both) this.goal.roll *= Math.exp(-2.5 * dt); // keep the horizon level in worlds

        const k = damp(this.cur.state === 'in' ? 3.2 : 9, dt);
        lerpView(this.view, this.goal, k);
        this.apply(c, this.view, isObj ? 0 : Math.sin(t * 0.17) * 0.09 * this.idle);
    }

    // Toward you: an object floats up to the glass, a world comes through it until you're standing inside.
    fly(amount) {
        this.goal.approach = clampApproach(this.cur, this.goal.approach + amount * (this.cur.kind === 'world' ? 1.6 : 1));
        if (Math.abs(amount) > 0.01) coachDone('fly');
    }

    resetView() {
        if (!this.cur) return;
        this.goal = cloneView(this.cur.home);
        this.spin = 0;
    }

    apply(c, v, sway) {
        c.root.position.set(0, 0.03, (c.kind === 'object' ? OBJECT_Z : WORLD_Z) + v.approach);
        c.root.rotation.set(v.pitch, v.yaw + sway, v.roll, 'ZXY');
        const s = c.home.base * v.zoom;
        c.inner.scale.setScalar(s);
        c.inner.position.copy(v.focus).multiplyScalar(-s);
    }

    animateTransitions(dt) {
        const c = this.cur;
        if (c && c.state === 'in') {
            c.t += dt;
            const p = clamp(c.t / REVEAL_TIME, 0, 1);
            c.fx.reveal.value = p >= 1 ? 1 : 1 - Math.pow(1 - p, 2.2);
            c.mesh.updateVersion();
            if (p >= 1) c.state = 'shown';
        }
        for (const o of this.leaving) {
            o.t += dt;
            o.fx.vanish.value = clamp(o.t / VANISH_TIME, 0, 1);
            o.mesh.updateVersion();
            if (o.t >= VANISH_TIME) this.drop(o);
        }
        this.leaving = this.leaving.filter((o) => !o.gone);
    }

    drop(o) {
        o.gone = true;
        this.stage.scene.remove(o.root);
        o.mesh.dispose();
    }

    dispose() {
        this.disposed = true;
        this.token++;
        this.abort?.abort();
        window.removeEventListener('keydown', this.onKey);
        this.unsub?.();
        for (const o of [this.cur, ...this.leaving]) if (o && !o.gone) this.drop(o);
        if (this.spark) {
            this.stage.scene.remove(this.spark);
            this.spark.dispose();
        }
        if (this.portal) {
            this.setPortal(false);
            this.stage.scene.remove(this.portal);
            this.portal.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
        }
        if (this.prevRatio) {
            this.stage.renderer.setPixelRatio(this.prevRatio);
            this.stage.resize();
        }
        ui.set({ splatStatus: 'idle' });
    }
}

function makeView() {
    return { yaw: 0, pitch: 0, roll: 0, zoom: 1, approach: 0, focus: new THREE.Vector3(), base: 1 };
}
function cloneView(v) {
    return { ...v, focus: v.focus.clone() };
}
function lerpView(v, g, k) {
    v.yaw += (g.yaw - v.yaw) * k;
    v.pitch += (g.pitch - v.pitch) * k;
    v.roll += (g.roll - v.roll) * k;
    v.zoom += (g.zoom - v.zoom) * k;
    v.approach += (g.approach - v.approach) * k;
    v.focus.lerp(g.focus, k);
}
const clampApproach = (c, a) => clamp(a, ...APPROACH[c.kind]);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function splatSource(mesh) {
    const ps = mesh.extSplats || mesh.packedSplats;
    return ps?.numSplats ? ps : ps?.lodSplats;
}

// Robust size of a splat cloud: a few thousand sampled centres and the 3rd..97th percentile
// on each axis, so a handful of stray floaters can't shrink the fitted object.
function measure(mesh) {
    // With lod: true Spark keeps only the LoD tree, whose leaves are the original splats.
    const ps = splatSource(mesh);
    const n = ps?.numSplats || 0;
    const center = new THREE.Vector3();
    if (!n) {
        const box = mesh.getBoundingBox(true);
        box.getCenter(center);
        const size = box.getSize(new THREE.Vector3());
        return { center, extent: Math.max(size.x, size.y, size.z), radius: size.length() / 2 };
    }
    const S = Math.min(n, 5000);
    const axes = [[], [], []];
    for (let k = 0; k < S; k++) {
        const c = ps.getSplat(Math.floor((k * n) / S)).center;
        if (Number.isFinite(c.x + c.y + c.z)) { axes[0].push(c.x); axes[1].push(c.y); axes[2].push(c.z); }
    }
    // Tukey fences first: some captures park a sky shell or junk splats a hundred thousand units away.
    const lo = new THREE.Vector3(), hi = new THREE.Vector3();
    axes.forEach((a, i) => {
        a.sort((x, y) => x - y);
        const q = (p) => a[Math.floor((a.length - 1) * p)];
        const q1 = q(0.25), q3 = q(0.75), f = (q3 - q1) * 2;
        const kept = a.filter((x) => x >= q1 - f && x <= q3 + f);
        const k = (p) => kept[Math.floor((kept.length - 1) * p)];
        lo.setComponent(i, k(0.03));
        hi.setComponent(i, k(0.97));
    });
    center.addVectors(lo, hi).multiplyScalar(0.5);
    const size = hi.sub(lo);
    return { center, extent: Math.max(size.x, size.y, size.z), radius: size.length() / 2 };
}

// Local copy first (npm run splats), then the web. Vite answers a missing file with its
// index.html, so an HTML reply counts as "not here".
async function fetchBytes(sources, signal, onProgress) {
    let lastErr;
    for (const url of sources) {
        try {
            const res = await fetch(url, { signal });
            if (!res.ok || (res.headers.get('content-type') || '').includes('text/html')) {
                lastErr = new Error(`${url}: ${res.status}`);
                continue;
            }
            const total = Number(res.headers.get('content-length')) || 0;
            const reader = res.body.getReader();
            const chunks = [];
            let got = 0;
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                got += value.length;
                if (total) onProgress(got / total);
            }
            const bytes = new Uint8Array(got);
            let o = 0;
            for (const c of chunks) { bytes.set(c, o); o += c.length; }
            return bytes;
        } catch (e) {
            if (e.name === 'AbortError') throw e;
            lastErr = e;
        }
    }
    throw lastErr || new Error('No source');
}
