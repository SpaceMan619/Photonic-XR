import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { ui, toast, coachDone } from '../engine/store';
import { audio } from '../engine/audio';
import { clamp } from '../engine/filters';
import { Sparks } from '../engine/fx';

const CLEAR_HOLD = 0.9;

// Pinch to draw light in the air. Your hand's distance from the camera sets the depth,
// so strokes are true 3D. The other hand turns the sculpture.
export class DrawDemo {
    constructor(stage) {
        this.stage = stage;
        this.root = new THREE.Group();
        this.root.position.set(0, 0, -1.2);
        stage.scene.add(this.root);
        this.strokes = [];
        this.active = [null, null];
        this.rot = new THREE.Vector2(0, 0);
        this.rotVel = new THREE.Vector2(0, 0);
        this.turn = [null, null];
        this.hue = Math.random();
        this.sparks = new Sparks(stage.scene, 1200);
        this.material = new LineMaterial({ linewidth: 5, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
        // A wide, faint copy behind each stroke: the soft halo that makes it read as light on a pale sky.
        this.halo = new LineMaterial({ linewidth: 22, vertexColors: true, transparent: true, opacity: 0.22, depthWrite: false });
        this.tips = [0, 1].map(() => {
            const m = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            m.visible = false;
            stage.scene.add(m);
            return m;
        });
        this.resize();
        this._v = new THREE.Vector3();
        this.onKey = (e) => {
            if (e.key === 'z') this.undo();
            if (e.key === 'c') this.clear();
        };
        window.addEventListener('keydown', this.onKey);
    }

    init() {
        this.voice = this.makeVoice();
        this.stage.setRoomTint('#a58cff', 0.8);
    }

    resize() {
        for (const m of [this.material, this.halo]) m.resolution.set(this.stage.container.clientWidth, this.stage.container.clientHeight);
    }

    makeVoice() {
        if (!audio.ctx) return null;
        const ctx = audio.ctx;
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'triangle';
        f.type = 'lowpass';
        f.frequency.value = 1800;
        g.gain.value = 0;
        const p = audio.panner(new THREE.Vector3());
        o.connect(f).connect(g).connect(p);
        o.start();
        return { o, g, f, p };
    }

    penPoint(h) {
        // Pen depth: neutral hand draws just behind the glass; push in to draw deeper.
        const z = clamp(-0.4 - h.z * 1.6, -3, 0.5);
        return this.stage.pointAtZ(h.x, h.y, z, new THREE.Vector3());
    }

    update(dt, t, frame) {
        const st = this.stage;
        const mirror = ui.get().drawMirror;
        let drawingSpeed = 0, drawingPos = null;

        frame.hands.forEach((h, i) => {
            st.cursorProgress[i] = 0;
            const tip = this.tips[i];
            tip.visible = h.present && !h.captured;
            if (!h.present || h.captured) { this.end(i); return; }
            const p = this.penPoint(h);
            tip.position.copy(p);
            const col = new THREE.Color().setHSL(this.hue, 0.75, 0.62);
            tip.material.color.copy(col).multiplyScalar(h.pinch ? 1.3 : 1);
            tip.scale.setScalar(h.pinch ? 1.3 : 0.8 + Math.sin(t * 6) * 0.1);

            if (h.fist) {
                st.cursorProgress[i] = clamp(h.fistTime / CLEAR_HOLD, 0, 1);
                if (h.fistTime >= CLEAR_HOLD && !this._cleared) { this.clear(); this._cleared = true; }
                this.end(i);
                return;
            }
            if (h.pushed) this.undo();

            const other = frame.hands[1 - i];
            const otherDrawing = !!this.active[1 - i];
            if (h.justPinched) {
                if (otherDrawing || this.strokes.length && other.present && other.pinch && !this.active[1 - i]) {
                    this.turn[i] = { x: h.x, y: h.y, rot: this.rot.clone() };
                } else {
                    this.begin(i, p, mirror);
                    coachDone('draw');
                }
            }
            if (h.pinch && this.active[i]) {
                const speed = this.extend(i, p, t);
                drawingSpeed = Math.max(drawingSpeed, speed);
                drawingPos = p;
                if (Math.random() < 0.5) this.sparks.emit(p, { count: 1, speed: 0.15, color: col, size: 10 });
            }
            if (h.pinch && this.turn[i]) {
                const tr = this.turn[i];
                this.rot.set(tr.rot.x + (h.x - tr.x) * 4, clamp(tr.rot.y + (h.y - tr.y) * 3, -1.2, 1.2));
                coachDone('rotate');
            }
            if (!h.pinch) {
                this.end(i);
                this.turn[i] = null;
                // An open hand swiped fast spins the sculpture.
                if (h.fingers >= 4 && Math.abs(h.vx) > 1.2) this.rotVel.x += h.vx * dt * 3;
            }
        });
        if (!frame.hands.some((h) => h.fist)) this._cleared = false;

        if (!this.turn.some(Boolean)) {
            this.rot.x += this.rotVel.x * dt;
            this.rotVel.multiplyScalar(Math.exp(-1.8 * dt));
        }
        this.root.rotation.set(this.rot.y, this.rot.x, 0);

        // The pen hums: pitch follows height, volume follows speed.
        if (this.voice) {
            const v = this.voice, ct = audio.ctx.currentTime;
            const target = drawingPos ? clamp(drawingSpeed * 0.06, 0, 0.12) : 0;
            v.g.gain.setTargetAtTime(target, ct, 0.05);
            if (drawingPos) {
                v.o.frequency.setTargetAtTime(220 * Math.pow(2, (drawingPos.y + 1) * 1.2), ct, 0.04);
                v.f.frequency.setTargetAtTime(600 + drawingSpeed * 500, ct, 0.05);
                audio.place(v.p, drawingPos);
            }
        }

        this.hue = (this.hue + dt * 0.04) % 1;
        this.sparks.update(dt);
    }

    begin(i, p, mirror) {
        const make = () => {
            const s = { pts: [], cols: [], line: null };
            this.strokes.push(s);
            return s;
        };
        this.active[i] = { main: make(), mirror: mirror ? make() : null, last: null, lastT: 0 };
        audio.tone({ freq: 660, type: 'sine', dur: 0.08, gain: 0.05, pos: p });
    }

    extend(i, worldP, t) {
        const a = this.active[i];
        const local = this.root.worldToLocal(worldP.clone());
        if (a.last) {
            local.lerp(a.last, 0.45); // light smoothing
            const d = local.distanceTo(a.last);
            if (d < 0.006) return 0;
        }
        const speed = a.last ? local.distanceTo(a.last) / Math.max(1e-3, t - a.lastT) : 0;
        a.last = local.clone();
        a.lastT = t;
        const c = new THREE.Color().setHSL((this.hue + a.main.pts.length / 3000) % 1, 0.75, 0.62).multiplyScalar(1.15);
        this.push(a.main, local, c);
        if (a.mirror) this.push(a.mirror, new THREE.Vector3(-local.x, local.y, local.z), c);
        return speed;
    }

    push(s, p, c) {
        s.pts.push(p.x, p.y, p.z);
        s.cols.push(c.r, c.g, c.b);
        if (s.pts.length < 6) return;
        const g = new LineGeometry();
        g.setPositions(s.pts);
        g.setColors(s.cols);
        if (!s.line) {
            s.halo = new Line2(g, this.halo);
            s.line = new Line2(g, this.material);
            s.halo.frustumCulled = s.line.frustumCulled = false;
            this.root.add(s.halo, s.line);
        } else {
            s.line.geometry.dispose();
            s.line.geometry = s.halo.geometry = g;
        }
    }

    end(i) {
        if (!this.active[i]) return;
        const a = this.active[i];
        this.active[i] = null;
        for (const s of [a.main, a.mirror]) {
            if (s && !s.line) this.strokes.splice(this.strokes.indexOf(s), 1);
        }
    }

    undo() {
        const s = this.strokes.pop();
        if (!s) return;
        if (s.line) { this.root.remove(s.line, s.halo); s.line.geometry.dispose(); }
        audio.tone({ freq: 500, to: 250, type: 'sine', dur: 0.15, gain: 0.08 });
        toast('Undid last stroke');
    }

    clear() {
        if (!this.strokes.length) return;
        for (const s of this.strokes) {
            if (!s.line) continue;
            // Each stroke bursts into sparks along its length.
            for (let k = 0; k < s.pts.length; k += 3 * 12) {
                const p = this.root.localToWorld(new THREE.Vector3(s.pts[k], s.pts[k + 1], s.pts[k + 2]));
                this.sparks.emit(p, { count: 3, speed: 0.8, color: new THREE.Color(s.cols[k], s.cols[k + 1], s.cols[k + 2]) });
            }
            this.root.remove(s.line, s.halo);
            s.line.geometry.dispose();
        }
        this.strokes = [];
        this.active = [null, null];
        audio.dissolve(new THREE.Vector3(0, 0, -1));
        toast('Canvas cleared');
    }

    dispose() {
        window.removeEventListener('keydown', this.onKey);
        for (const s of this.strokes) s.line?.geometry.dispose();
        this.stage.scene.remove(this.root, ...this.tips);
        this.material.dispose();
        this.halo.dispose();
        this.sparks.dispose();
        if (this.voice) {
            const ct = audio.ctx.currentTime;
            this.voice.g.gain.setTargetAtTime(0, ct, 0.05);
            this.voice.o.stop(ct + 0.3);
        }
    }
}

