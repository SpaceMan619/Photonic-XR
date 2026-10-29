import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ui } from './store';
import { audio } from './audio';
import { damp, clamp } from './filters';
import { HandViz } from './handviz';
import { THEME, color } from './theme';

// The screen is a window: world units are "half screen heights", the screen
// rectangle sits at z = 0, the room goes back into negative z, and the camera is
// your eye. Moving your head moves the eye, and the projection is skewed
// (off-axis) so the screen edges stay locked like a real window frame.
export const SCREEN_H = 2;
export const EYE_Z = 3.4;
export const ROOM_D = 6;

export class Stage {
    constructor(container, tracker) {
        this.container = container;
        this.tracker = tracker;
        this.eye = new THREE.Vector3(0, 0, EYE_Z);
        this.clock = new THREE.Clock();
        this.demo = null;
        this.prev = [{ pinch: false, push: 0 }, { pinch: false, push: 0 }];
        this.uiCapture = [false, false];
        this.cursorProgress = [0, 0];
        this.cursorTint = [null, null];

        // Direct render, no post-processing: a bloom + MSAA composer cost ~20 fps on the Air for a glow the light theme barely shows.
        const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
        // Pixel ratio cap: the biggest single lever for keeping a fanless laptop cool.
        r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        r.setClearColor(THEME.bg, 1);
        container.appendChild(r.domElement);

        this.scene = new THREE.Scene();
        this.sky = makeSky();
        this.scene.add(this.sky);
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
        this.scene.add(this.camera);

        this.labels = new CSS2DRenderer();
        Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
        container.appendChild(this.labels.domElement);


        this.roomGroup = new THREE.Group();
        this.scene.add(this.roomGroup);
        this.dust = makeDust();
        this.scene.add(this.dust);
        this.handViz = new HandViz(this);
        this.scene.add(this.handViz.group);

        this.cursors = [0, 1].map((i) => {
            const el = document.createElement('div');
            el.className = 'hand-cursor';
            el.dataset.slot = i;
            el.innerHTML = '<div class="hc-ring"></div><div class="hc-dot"></div>';
            container.appendChild(el);
            return el;
        });

        this.aspect = 16 / 9;
        this.resize = this.resize.bind(this);
        window.addEventListener('resize', this.resize);
        this.resize();
        this._raf = requestAnimationFrame(this.loop.bind(this));
    }

    get W() { return SCREEN_H * this.aspect; }
    get H() { return SCREEN_H; }

    resize() {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        if (!w || !h) return;
        this.aspect = w / h;
        this.renderer.setSize(w, h);
        this.labels.setSize(w, h);
        this.buildRoom();
        this.demo?.resize?.();
    }

    buildRoom() {
        this.roomGroup.clear();
        const W = this.W, H = this.H, D = ROOM_D;
        const pos = [], col = [];
        const line = color(THEME.sky), fog = color(THEME.bg), c = new THREE.Color();
        const seg = (a, b) => {
            pos.push(...a, ...b);
            for (const p of [a, b]) {
                // Lines melt into the mist with distance, like a room fading into a dream.
                c.copy(line).lerp(fog, Math.min(1, -p[2] / D) * 0.9);
                col.push(c.r, c.g, c.b);
            }
        };
        const n = 10;
        for (let i = 1; i <= n; i++) {
            const z = -(i / n) * D;
            seg([-W / 2, -H / 2, z], [W / 2, -H / 2, z]);
            seg([-W / 2, H / 2, z], [W / 2, H / 2, z]);
            seg([-W / 2, -H / 2, z], [-W / 2, H / 2, z]);
            seg([W / 2, -H / 2, z], [W / 2, H / 2, z]);
        }
        const m = 8;
        for (let i = 0; i <= m; i++) {
            const x = -W / 2 + (i / m) * W, y = -H / 2 + (i / m) * H;
            seg([x, -H / 2, 0], [x, -H / 2, -D]);
            seg([x, H / 2, 0], [x, H / 2, -D]);
            seg([-W / 2, y, 0], [-W / 2, y, -D]);
            seg([W / 2, y, 0], [W / 2, y, -D]);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        this.room = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false,
        }));
        this.roomGroup.add(this.room);
    }

    setRoomTint(tint, strength = 1) {
        if (!this.room) return;
        this.room.material.color.set(tint);
        this.room.material.opacity = 0.28 * strength;
    }

    async setDemo(DemoClass) {
        this.demo?.dispose();
        this.demo = null;
        this.setRoomTint(THEME.sky, 1);
        if (DemoClass) {
            const d = new DemoClass(this);
            this.demo = d;
            await d.init?.();
        }
    }

    // ---------- helpers for demos ----------
    // Point on the screen plane (z = 0) for a 0..1 screen coordinate.
    screenPoint(sx, sy, out = new THREE.Vector3()) {
        return out.set((sx - 0.5) * this.W, (0.5 - sy) * this.H, 0);
    }
    // Ray from your eye through the hand's spot on the screen.
    // Pointing "through the window" like this mixes where you look with where you point.
    ray(sx, sy, ray = new THREE.Ray()) {
        ray.origin.copy(this.eye);
        this.screenPoint(sx, sy, ray.direction).sub(this.eye).normalize();
        return ray;
    }
    // A point that lands exactly on the hand's screen spot at any depth z.
    pointAtZ(sx, sy, z, out = new THREE.Vector3()) {
        const p = this.screenPoint(sx, sy, out);
        const t = (z - this.eye.z) / (0 - this.eye.z);
        return p.sub(this.eye).multiplyScalar(t).add(this.eye);
    }
    toScreen(v) {
        const p = v.clone().project(this.camera);
        return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
    }

    applyOffAxis() {
        const e = this.eye, n = this.camera.near, f = this.camera.far;
        const W = this.W, H = this.H;
        this.camera.position.copy(e);
        this.camera.quaternion.identity();
        this.camera.updateMatrixWorld();
        const s = n / e.z;
        this.camera.projectionMatrix.makePerspective(
            (-W / 2 - e.x) * s, (W / 2 - e.x) * s, (H / 2 - e.y) * s, (-H / 2 - e.y) * s, n, f);
        this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    }

    // ---------- frame ----------
    buildFrame(t, dt) {
        const tr = this.tracker;
        // Tracking lands ~25 times a second; glide between updates so the cursor moves at 60.
        this.smooth ??= [{ x: 0.5, y: 0.5, z: 0, on: false }, { x: 0.5, y: 0.5, z: 0, on: false }];
        const glide = tr.mode === 'camera' ? damp(28, dt) : 1;
        const now = tr.now(); // tracker timestamps use performance.now(), not the render clock
        const hands = tr.hands.map((h, i) => {
            const prev = this.prev[i];
            const present = h.present;
            const pinch = present && h.pinch;
            const sm = this.smooth[i];
            if (!present || !sm.on) { sm.x = h.x; sm.y = h.y; sm.z = h.z; }
            sm.on = present;
            sm.x += (h.x - sm.x) * glide; sm.y += (h.y - sm.y) * glide; sm.z += (h.z - sm.z) * glide;
            const f = {
                slot: i, present, x: sm.x, y: sm.y, z: sm.z, vx: h.vx, vy: h.vy, vz: h.vz,
                pinch, pinchStrength: h.pinchStrength, fist: present && h.fist,
                fistTime: present && h.fist ? now - h.fistSince : 0,
                fingers: h.fingers, landmarks: h.landmarks,
                justPinched: pinch && !prev.pinch,
                justReleased: !pinch && prev.pinch,
                pushed: present && h.pushCount !== prev.push,
                ui: null,
            };
            prev.pinch = pinch;
            prev.push = h.pushCount;
            return f;
        });

        // Hand-pressable HTML buttons ([data-hand]): hover with the cursor, press with a pinch or a push.
        hands.forEach((h, i) => {
            let el = null;
            if (h.present) {
                const hit = document.elementFromPoint(h.x * innerWidth, h.y * innerHeight);
                el = hit?.closest?.('[data-hand]') || null;
            }
            if (this._hoverEl?.[i] !== el) {
                this._hoverEl ??= [];
                this._hoverEl[i]?.classList.remove('hand-hover');
                el?.classList.add('hand-hover');
                if (el) audio.hover(null, 1.3);
                this._hoverEl[i] = el;
            }
            h.ui = el;
            if (el && (h.justPinched || h.pushed)) {
                // In mouse mode the browser already delivers a real click.
                if (tr.mode !== 'mouse' || h.pushed) el.click();
                el.classList.add('hand-press');
                setTimeout(() => el.classList.remove('hand-press'), 180);
                this.uiCapture[i] = true;
            }
            if (!h.pinch) this.uiCapture[i] = false;
            h.captured = this.uiCapture[i];
        });
        return { hands, head: tr.head, t };
    }

    loop() {
        this._raf = requestAnimationFrame(this.loop.bind(this));
        const l0 = performance.now();
        const perf = (this.perf ??= { fps: 0, frames: 0, t: l0, cpuMs: 0, gap: 0, last: l0, worst: 0 });
        perf.frames++;
        perf.worst = Math.max(perf.worst, l0 - perf.last);
        perf.last = l0;
        if (l0 - perf.t > 1000) { perf.fps = perf.frames; perf.frames = 0; perf.t = l0; perf.worstShown = perf.worst; perf.worst = 0; }
        const dt = Math.min(0.05, this.clock.getDelta());
        const t = this.clock.elapsedTime;
        const tr = this.tracker;
        tr.tickMouseHead?.(dt);

        // Eye follows the head. Gains exaggerate a little so the depth reads on a small screen.
        const hd = tr.head;
        const tx = hd.present ? clamp(hd.x, -1.2, 1.2) * this.W * 0.5 : Math.sin(t * 0.3) * 0.25;
        const ty = hd.present ? clamp(hd.y, -1, 1) * this.H * 0.4 : Math.sin(t * 0.21) * 0.1;
        const tz = hd.present ? EYE_Z * clamp(hd.d, 0.6, 1.6) : EYE_Z;
        const k = damp(9, dt);
        this.eye.x += (tx - this.eye.x) * k;
        this.eye.y += (ty - this.eye.y) * k;
        this.eye.z += (tz - this.eye.z) * k;
        this.applyOffAxis();
        audio.setListener(this.eye.x, this.eye.y, this.eye.z);

        const frame = this.buildFrame(t, dt);
        this.frame = frame;
        this.dust.material.uniforms.uTime.value = t;
        this.sky.material.uniforms.uTime.value = t;
        this.sky.material.uniforms.uEye.value.set(this.eye.x, this.eye.y);
        this.sky.material.uniforms.uAspect.value = this.aspect;
        this.handViz.visible = tr.mode === 'camera';
        this.handViz.update(frame, dt);
        this.demo?.update?.(dt, t, frame);
        this.updateCursors(frame);

        this.renderer.render(this.scene, this.camera);
        this.labels.render(this.scene, this.camera);
        perf.cpuMs += (performance.now() - l0 - perf.cpuMs) * 0.1;

        if (((this._uiTick = (this._uiTick || 0) + 1) % 15) === 0) {
            ui.set({
                hands: frame.hands.filter((h) => h.present).length,
                face: tr.mode === 'camera' && hd.present,
                fps: tr.stats.fps,
                renderFps: perf.fps,
            });
        }
    }

    updateCursors(frame) {
        frame.hands.forEach((h, i) => {
            const el = this.cursors[i];
            el.style.opacity = h.present ? 1 : 0;
            if (!h.present) return;
            el.style.transform = `translate(${h.x * innerWidth}px, ${h.y * innerHeight}px) scale(${1 - h.z * 0.25})`;
            el.classList.toggle('pinch', h.pinch);
            el.classList.toggle('fist', h.fist);
            el.classList.toggle('on-ui', !!h.ui);
            el.style.setProperty('--progress', this.cursorProgress[i]);
            el.style.setProperty('--strength', h.pinchStrength);
            if (this.cursorTint[i]) el.style.setProperty('--tint', this.cursorTint[i]);
            else el.style.removeProperty('--tint');
        });
    }

    dispose() {
        cancelAnimationFrame(this._raf);
        window.removeEventListener('resize', this.resize);
        this.demo?.dispose();
        this.renderer.dispose();
        this.container.innerHTML = '';
    }
}

// Drifting aurora, drawn as one full-screen quad behind everything (cheap: one shader, no textures).
// It shifts a touch against your head movement, which adds to the window illusion.
function makeSky() {
    const m = new THREE.ShaderMaterial({
        depthTest: false, depthWrite: false,
        uniforms: {
            uTime: { value: 0 }, uAspect: { value: 1 }, uEye: { value: new THREE.Vector2() },
            uBg: { value: color(THEME.bg) }, uGlow: { value: color(THEME.glow) },
            uSky: { value: color(THEME.sky) }, uLilac: { value: color('#c9b8ff') },
        },
        vertexShader: /* glsl */`
            varying vec2 vUv;
            void main(){ vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.9999, 1.0); }`,
        fragmentShader: /* glsl */`
            uniform float uTime; uniform float uAspect; uniform vec2 uEye;
            uniform vec3 uBg; uniform vec3 uGlow; uniform vec3 uSky; uniform vec3 uLilac;
            varying vec2 vUv;
            float blob(vec2 p, vec2 c, float r){ vec2 d = (p - c) * vec2(uAspect, 1.0); return smoothstep(r, 0.0, length(d)); }
            void main(){
                vec2 p = vUv - uEye * vec2(0.015, 0.02);
                float t = uTime * 0.12;
                vec3 col = uBg;
                col = mix(col, uGlow, 0.85 * blob(p, vec2(0.15 + 0.1*sin(t), 0.85 + 0.06*cos(t*1.3)), 0.95));
                col = mix(col, uSky,  0.55 * blob(p, vec2(0.95 + 0.08*cos(t*0.8), 0.45 + 0.1*sin(t*1.1)), 0.85));
                col = mix(col, uLilac,0.45 * blob(p, vec2(0.45 + 0.12*sin(t*0.7+2.0), 0.05 + 0.05*cos(t)), 0.8));
                col = mix(col, uGlow, 0.5 * blob(p, vec2(0.6 + 0.1*cos(t*0.9+1.0), 0.7 + 0.08*sin(t*0.6)), 0.55));
                col = mix(col, vec3(1.0), 0.18); // thin white veil, like Dreamloom
                gl_FragColor = vec4(col, 1.0);
            }`,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
    mesh.frustumCulled = false;
    mesh.renderOrder = -100;
    return mesh;
}

function makeDust() {
    const N = 900;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 7;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 2.4;
        pos[i * 3 + 2] = -Math.random() * ROOM_D + 0.8;
        seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    // Soft pearly motes: white cores with a faint periwinkle edge.
    const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { uTime: { value: 0 }, uEdge: { value: color(THEME.sky) } },
        vertexShader: /* glsl */`
            attribute float seed; uniform float uTime; varying float vA;
            void main(){
                vec3 p = position;
                p.y += sin(uTime*0.2 + seed*40.0)*0.08 + mod(uTime*0.02*(0.5+seed), 0.3);
                p.x += cos(uTime*0.15 + seed*30.0)*0.06;
                vec4 mv = modelViewMatrix * vec4(p,1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = (3.0 + seed*6.0) * (3.0 / -mv.z);
                vA = (0.35 + 0.65*abs(sin(uTime*0.6 + seed*20.0))) * smoothstep(9.0, 2.0, -mv.z);
            }`,
        fragmentShader: /* glsl */`
            uniform vec3 uEdge; varying float vA;
            void main(){
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.1, d) * vA * 0.8;
                vec3 c = mix(vec3(1.0), uEdge, smoothstep(0.1, 0.5, d));
                gl_FragColor = vec4(c, a);
            }`,
    });
    return new THREE.Points(g, m);
}
