import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ui } from './store';
import { audio } from './audio';
import { damp, clamp } from './filters';
import { HandViz } from './handviz';

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

        const r = (this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }));
        // Pixel ratio cap: the biggest single lever for keeping a fanless laptop cool.
        r.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        r.setClearColor(0x04050a, 1);
        container.appendChild(r.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 60);
        this.scene.add(this.camera);

        this.labels = new CSS2DRenderer();
        Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
        container.appendChild(this.labels.domElement);

        const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
        this.composer = new EffectComposer(r, rt);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 0.92);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());

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
        this.composer.setSize(w, h);
        // Bloom at half resolution: looks the same, costs a quarter.
        this.bloom.resolution.set(w / 2, h / 2);
        this.labels.setSize(w, h);
        this.buildRoom();
        this.demo?.resize?.();
    }

    buildRoom() {
        this.roomGroup.clear();
        const W = this.W, H = this.H, D = ROOM_D;
        const pos = [], col = [];
        const c = new THREE.Color();
        const seg = (a, b) => {
            pos.push(...a, ...b);
            for (const p of [a, b]) {
                // Brighter at the screen edge, fading into the distance.
                const f = 1 - Math.min(1, -p[2] / D) * 0.85;
                c.setRGB(0.16 * f, 0.55 * f, 0.9 * f);
                col.push(c.r, c.g, c.b);
            }
        };
        const n = 12;
        for (let i = 0; i <= n; i++) {
            const z = -(i / n) * D;
            // rings around the room
            seg([-W / 2, -H / 2, z], [W / 2, -H / 2, z]);
            seg([-W / 2, H / 2, z], [W / 2, H / 2, z]);
            seg([-W / 2, -H / 2, z], [-W / 2, H / 2, z]);
            seg([W / 2, -H / 2, z], [W / 2, H / 2, z]);
        }
        const m = 10;
        for (let i = 0; i <= m; i++) {
            const x = -W / 2 + (i / m) * W, y = -H / 2 + (i / m) * H;
            seg([x, -H / 2, 0], [x, -H / 2, -D]);
            seg([x, H / 2, 0], [x, H / 2, -D]);
            seg([-W / 2, y, 0], [-W / 2, y, -D]);
            seg([W / 2, y, 0], [W / 2, y, -D]);
            seg([x, -H / 2, -D], [x, H / 2, -D]);
            seg([-W / 2, y, -D], [W / 2, y, -D]);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        this.room = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
            vertexColors: true, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        this.roomGroup.add(this.room);
    }

    setRoomTint(color, strength = 1) {
        if (!this.room) return;
        this.room.material.color.set(color).multiplyScalar(strength);
    }

    async setDemo(DemoClass) {
        this.demo?.dispose();
        this.demo = null;
        this.setRoomTint(0xffffff, 1);
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
    buildFrame(t) {
        const tr = this.tracker;
        const now = tr.now(); // tracker timestamps use performance.now(), not the render clock
        const hands = tr.hands.map((h, i) => {
            const prev = this.prev[i];
            const present = h.present;
            const pinch = present && h.pinch;
            const f = {
                slot: i, present, x: h.x, y: h.y, z: h.z, vx: h.vx, vy: h.vy, vz: h.vz,
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

        const frame = this.buildFrame(t);
        this.frame = frame;
        this.dust.material.uniforms.uTime.value = t;
        this.handViz.visible = tr.mode === 'camera';
        this.handViz.update(frame, dt);
        this.demo?.update?.(dt, t, frame);
        this.updateCursors(frame);

        this.composer.render();
        this.labels.render(this.scene, this.camera);

        if (((this._uiTick = (this._uiTick || 0) + 1) % 15) === 0) {
            ui.set({
                hands: frame.hands.filter((h) => h.present).length,
                face: tr.mode === 'camera' && hd.present,
                fps: tr.stats.fps,
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

function makeDust() {
    const N = 1400;
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
    const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */`
            attribute float seed; uniform float uTime; varying float vA;
            void main(){
                vec3 p = position;
                p.y += sin(uTime*0.2 + seed*40.0)*0.08;
                p.x += cos(uTime*0.15 + seed*30.0)*0.06;
                vec4 mv = modelViewMatrix * vec4(p,1.0);
                gl_Position = projectionMatrix * mv;
                gl_PointSize = (2.0 + seed*3.0) * (3.0 / -mv.z);
                vA = (0.25 + 0.75*abs(sin(uTime*0.8 + seed*20.0))) * smoothstep(9.0, 2.0, -mv.z);
            }`,
        fragmentShader: /* glsl */`
            varying float vA;
            void main(){
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.0, d) * vA;
                gl_FragColor = vec4(vec3(0.55,0.8,1.2) * a, a);
            }`,
    });
    return new THREE.Points(g, m);
}
