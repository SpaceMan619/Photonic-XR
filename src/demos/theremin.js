import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { ui, coachDone } from '../engine/store';
import { audio } from '../engine/audio';
import { clamp, damp } from '../engine/filters';

const LOW = 45, HIGH = 81;                 // A2 .. A5
const PENTA = [0, 3, 5, 7, 10];            // A minor pentatonic
const NAMES = ['A', 'A♯', 'B', 'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯'];
const WAVES = ['sine', 'sine', 'triangle', 'sawtooth', 'square', 'sawtooth'];
const N_WAVE = 256, N_BARS = 48;

const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const noteName = (m) => NAMES[((Math.round(m) - 69) % 12 + 12) % 12] + (Math.floor((Math.round(m) - 12) / 12) - 0);

function snap(m) {
    let best = m, bd = 99;
    for (let o = -12; o <= 48; o += 12) for (const s of PENTA) {
        const c = 45 + o + s;
        if (Math.abs(c - m) < bd) { bd = Math.abs(c - m); best = c; }
    }
    return best;
}

// Right hand pinch plays. Right hand height = pitch, pushing in = brighter.
// Left hand height = volume, left finger count = waveform.
export class ThereminDemo {
    constructor(stage) {
        this.stage = stage;
        this.root = new THREE.Group();
        stage.scene.add(this.root);
        this.midi = 57;
        this.level = 0;
        this.hue = 0.55;
        this.wave = new Float32Array(N_WAVE);
        this.freq = new Uint8Array(N_BARS * 4);
        this._v = new THREE.Vector3();
        this.onKey = (e) => { if (e.key === 's') ui.set({ thereminSnap: !ui.get().thereminSnap }); };
        window.addEventListener('keydown', this.onKey);
    }

    init() {
        const st = this.stage, W = st.W;
        // Live waveform: a ribbon with a soft halo, like the sculptor strokes.
        this.wavePts = new Float32Array(N_WAVE * 3);
        this.waveMat = new LineMaterial({ linewidth: 4, transparent: true, depthWrite: false });
        this.waveHaloMat = new LineMaterial({ linewidth: 18, transparent: true, opacity: 0.25, depthWrite: false });
        for (const m of [this.waveMat, this.waveHaloMat]) m.resolution.set(st.container.clientWidth, st.container.clientHeight);
        this.waveGeo = new LineGeometry();
        this.waveGeo.setPositions(this.wavePts);
        this.waveHalo = new Line2(this.waveGeo, this.waveHaloMat);
        this.waveLine = new Line2(this.waveGeo, this.waveMat);
        for (const l of [this.waveHalo, this.waveLine]) { l.position.z = -1.4; l.frustumCulled = false; this.root.add(l); }

        // Spectrum bars on the back wall.
        this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }), N_BARS);
        this.bars.position.z = -5.5;
        this.root.add(this.bars);

        // Pitch rail with note labels on the right.
        this.rail = new THREE.Group();
        this.rail.position.set(W * 0.42, 0, -0.6);
        for (let m = LOW; m <= HIGH; m++) {
            const inScale = PENTA.includes(((m - 45) % 12 + 12) % 12);
            if (!inScale) continue;
            const y = this.midiToY(m);
            const tick = new THREE.Mesh(new THREE.PlaneGeometry(m % 12 === 9 ? 0.22 : 0.12, 0.006),
                new THREE.MeshBasicMaterial({ color: new THREE.Color('#55627d'), transparent: true, opacity: 0.45 }));
            tick.position.y = y;
            this.rail.add(tick);
            if (m % 12 === 9) {
                const el = document.createElement('div');
                el.className = 'note-label';
                el.textContent = noteName(m);
                const lab = new CSS2DObject(el);
                lab.position.set(0.2, y, 0);
                this.rail.add(lab);
            }
        }
        this.marker = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        this.rail.add(this.marker);
        this.root.add(this.rail);

        this.makeVoice();
        st.setRoomTint('#7fa8ff', 1);
    }

    midiToY(m) { return ((m - LOW) / (HIGH - LOW) - 0.5) * this.stage.H * 0.8; }

    makeVoice() {
        if (!audio.ctx) return;
        const ctx = audio.ctx;
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
        const f = ctx.createBiquadFilter(), g = ctx.createGain();
        const delay = ctx.createDelay(1), fb = ctx.createGain(), dw = ctx.createGain();
        o2.detune.value = 7;
        lfo.frequency.value = 5.5;
        lfoG.gain.value = 0;
        lfo.connect(lfoG);
        lfoG.connect(o1.frequency);
        lfoG.connect(o2.frequency);
        f.type = 'lowpass';
        f.Q.value = 4;
        g.gain.value = 0;
        delay.delayTime.value = 0.33;
        fb.gain.value = 0.35;
        dw.gain.value = 0.3;
        const pan = audio.panner(new THREE.Vector3(0, 0, -1));
        const an = (this.analyser = ctx.createAnalyser());
        an.fftSize = 512;
        o1.connect(f); o2.connect(f);
        f.connect(g);
        g.connect(pan);
        g.connect(an);
        g.connect(delay); delay.connect(fb).connect(delay); delay.connect(dw).connect(pan);
        [o1, o2, lfo].forEach((o) => o.start());
        this.v = { o1, o2, lfoG, f, g, pan };
    }

    update(dt, t, frame) {
        const st = this.stage;
        const present = frame.hands.filter((h) => h.present && !h.captured);
        // The rightmost hand on screen is the pitch hand.
        const right = present.length ? present.reduce((a, b) => (b.x > a.x ? b : a)) : null;
        const left = present.length === 2 ? present.find((h) => h !== right) : null;
        const snapOn = ui.get().thereminSnap;

        let gate = 0;
        if (right) {
            const raw = LOW + (1 - clamp(right.y, 0, 1)) * (HIGH - LOW);
            const target = snapOn ? snap(raw) : raw;
            this.target = target;
            this.midi += (target - this.midi) * damp(snapOn ? 18 : 30, dt);
            gate = right.pinch ? 1 : right.pinchStrength > 0.5 ? (right.pinchStrength - 0.5) * 0.6 : 0;
            if (right.pinch) coachDone('play');
        }
        let vol = 0.7;
        let waveIdx = 2;
        if (left) {
            vol = clamp(1.1 - left.y * 1.2, 0, 1);
            waveIdx = clamp(left.fingers, 0, 5);
            if (Math.abs(left.y - 0.5) > 0.2) coachDone('volume');
        }
        const level = gate * vol;
        this.level += (level - this.level) * damp(20, dt);

        if (this.v) {
            const ct = audio.ctx.currentTime, v = this.v, hz = midiToHz(this.midi);
            v.o1.frequency.setTargetAtTime(hz, ct, 0.012);
            v.o2.frequency.setTargetAtTime(hz * (waveIdx === 5 ? 1.5 : 1), ct, 0.012);
            v.o1.type = WAVES[waveIdx];
            v.o2.type = WAVES[waveIdx];
            v.g.gain.setTargetAtTime(level * 0.25, ct, 0.03);
            v.lfoG.gain.setTargetAtTime(right && right.fingers >= 4 ? hz * 0.012 : hz * 0.003, ct, 0.2);
            v.f.frequency.setTargetAtTime(400 + clamp((right?.z ?? 0) + 0.5, 0, 1.5) * 4000 + (right?.x ?? 0.5) * 1500, ct, 0.05);
            if (right) audio.place(v.pan, st.pointAtZ(right.x, right.y, -0.5, this._v));
        }

        // Visuals
        this.hue = ((this.midi - LOW) / (HIGH - LOW)) * 0.75 + 0.5;
        const col = new THREE.Color().setHSL(this.hue % 1, 0.7, 0.62);
        this.marker.position.y = this.midiToY(this.midi);
        this.marker.material.color.copy(col).multiplyScalar(1 + this.level * 0.6);
        this.marker.scale.setScalar(1 + this.level * 0.8);

        const W = st.W;
        const pos = this.wavePts;
        if (this.analyser) this.analyser.getFloatTimeDomainData(this.wave);
        for (let i = 0; i < N_WAVE; i++) {
            const x = (i / (N_WAVE - 1) - 0.5) * W * 0.9;
            const env = Math.sin((i / (N_WAVE - 1)) * Math.PI);
            pos[i * 3] = x;
            pos[i * 3 + 1] = (this.analyser ? this.wave[i] * 2.4 : 0) * env + Math.sin(t * 2 + i * 0.05) * 0.01;
            pos[i * 3 + 2] = Math.cos(i * 0.08 + t) * 0.1 * this.level;
        }
        this.waveGeo.setPositions(pos);
        this.waveMat.color.copy(col).lerp(new THREE.Color('#24304a'), 0.25 - this.level * 0.2);
        this.waveHaloMat.color.copy(col);
        this.waveHaloMat.opacity = 0.15 + this.level * 0.25;

        if (this.analyser) this.analyser.getByteFrequencyData(this.freq);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        const bw = (W * 1.6) / N_BARS;
        for (let i = 0; i < N_BARS; i++) {
            const a = (this.freq[i * 2] || 0) / 255;
            const hgt = 0.04 + a * 2.2;
            p.set((i - N_BARS / 2 + 0.5) * bw, -st.H / 2 - 0.2 + hgt / 2 + 0.25, 0);
            s.set(bw * 0.6, hgt, 1);
            this.bars.setMatrixAt(i, m.compose(p, q, s));
            this.bars.setColorAt(i, new THREE.Color().setHSL((this.hue + i / N_BARS * 0.3) % 1, 0.75, 0.7 - a * 0.16));
        }
        this.bars.instanceMatrix.needsUpdate = true;
        if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;

        st.setRoomTint(col, 0.8 + this.level * 0.8);
        const name = right ? noteName(this.target ?? this.midi) : null;
        if (ui.get().thereminNote !== name) ui.set({ thereminNote: name });
    }

    resize() {
        for (const m of [this.waveMat, this.waveHaloMat]) m?.resolution.set(this.stage.container.clientWidth, this.stage.container.clientHeight);
    }

    dispose() {
        window.removeEventListener('keydown', this.onKey);
        this.waveGeo?.dispose();
        this.waveMat?.dispose();
        this.waveHaloMat?.dispose();
        this.stage.scene.remove(this.root);
        this.root.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
        if (this.v) {
            const ct = audio.ctx.currentTime;
            this.v.g.gain.setTargetAtTime(0, ct, 0.05);
            [this.v.o1, this.v.o2].forEach((o) => o.stop(ct + 0.4));
        }
        ui.set({ thereminNote: null });
    }
}
