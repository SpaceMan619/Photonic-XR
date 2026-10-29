import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { ui, coachDone, toast } from '../engine/store';
import { audio } from '../engine/audio';
import { clamp, damp } from '../engine/filters';
import { INSTRUMENTS, SONGS, SCALE, NAMES, midiToHz, noteName, strike, release } from './music';

// Only the white piano keys, C3 .. C5, so every note you can land on is in C major.
const BASE = 48;                           // C3
const N_DEG = 15;                          // C3 .. C5
const N_WAVE = 256, N_BARS = 48;
const INST = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i]));

const degToMidi = (d) => BASE + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
// Nearest white-key position for any note, for placing the marker on the rail.
const midiToDeg = (m) => { const o = Math.floor((m - BASE) / 12), k = ((m - BASE) % 12 + 12) % 12; return o * 7 + SCALE.findIndex((x) => x >= k); };

export function pickInstrument(step) {
    const i = INSTRUMENTS.findIndex((x) => x.id === ui.get().thereminInst);
    const next = INSTRUMENTS[(i + step + INSTRUMENTS.length) % INSTRUMENTS.length];
    ui.set({ thereminInst: next.id });
    toast(`${next.icon}  ${next.name}`, 1200);
}

// Right hand pinch plays. Right hand height = note, pushing in = brighter.
// Left hand height = volume, left pinch = next instrument.
// Notes are triggered from the tracker's input event, not the draw loop, so they sound at once.
export class ThereminDemo {
    constructor(stage) {
        this.stage = stage;
        this.root = new THREE.Group();
        stage.scene.add(this.root);
        this.deg = null;
        this.disp = 4;
        this.midi = degToMidi(4);
        this.playing = false;
        this.leftPinch = false;
        this.onUI = false;
        this.level = 0;
        this.hit = 0;
        this.hue = 0.55;
        this.notes = [];
        this.songPos = 0;
        this.wave = new Float32Array(N_WAVE);
        this.freq = new Uint8Array(N_BARS * 4);
        this._v = new THREE.Vector3();
        this.onKey = (e) => {
            const i = parseInt(e.key, 10) - 1;
            if (INSTRUMENTS[i]) { ui.set({ thereminInst: INSTRUMENTS[i].id }); toast(`${INSTRUMENTS[i].icon}  ${INSTRUMENTS[i].name}`, 1200); }
            if (e.key === 'ArrowRight') pickInstrument(1);
            if (e.key === 'ArrowLeft') pickInstrument(-1);
        };
        window.addEventListener('keydown', this.onKey);
        this.offInput = stage.tracker.onInput((hands) => this.onHands(hands));
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

        // Note rail on the right: one tick and letter per white key, so you can follow a song.
        this.rail = new THREE.Group();
        this.rail.position.set(W * 0.42, 0, -0.6);
        for (let d = 0; d < N_DEG; d++) {
            const m = degToMidi(d), isC = m % 12 === 0, y = this.degToY(d);
            const tick = new THREE.Mesh(new THREE.PlaneGeometry(isC ? 0.22 : 0.12, 0.006),
                new THREE.MeshBasicMaterial({ color: new THREE.Color('#55627d'), transparent: true, opacity: isC ? 0.6 : 0.4 }));
            tick.position.y = y;
            this.rail.add(tick);
            const el = document.createElement('div');
            el.className = `note-label ${isC ? 'c' : ''}`;
            el.textContent = isC ? noteName(m) : NAMES[m % 12];
            const lab = new CSS2DObject(el);
            lab.position.set(0.2, y, 0);
            this.rail.add(lab);
        }
        this.marker = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.05, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
        this.rail.add(this.marker);
        this.root.add(this.rail);

        this.makeVoice();
        st.setRoomTint('#7fa8ff', 1);
    }

    degToY(d) { return (d / (N_DEG - 1) - 0.5) * this.stage.H * 0.8; }

    makeVoice() {
        if (!audio.ctx) return;
        const ctx = audio.ctx;
        // Held voice (strings, flute, theremin).
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        const lfo = ctx.createOscillator(), lfoG = ctx.createGain();
        const f = ctx.createBiquadFilter(), sg = ctx.createGain();
        lfo.frequency.value = 5.5;
        lfoG.gain.value = 0;
        lfo.connect(lfoG);
        lfoG.connect(o1.frequency);
        lfoG.connect(o2.frequency);
        f.type = 'lowpass';
        f.Q.value = 0.8;
        sg.gain.value = 0;
        o1.connect(f); o2.connect(f);
        f.connect(sg);

        // Shared output: brightness filter, volume, a light echo, 3D position.
        const tone = ctx.createBiquadFilter(), out = ctx.createGain();
        const delay = ctx.createDelay(1), fb = ctx.createGain(), dw = ctx.createGain();
        tone.type = 'lowpass';
        tone.Q.value = 0.7;
        tone.frequency.value = 4000;
        out.gain.value = 0.22;
        delay.delayTime.value = 0.28;
        fb.gain.value = 0.18;
        dw.gain.value = 0.12;
        const pan = audio.panner(new THREE.Vector3(0, 0, -1));
        const an = (this.analyser = ctx.createAnalyser());
        an.fftSize = 512;
        sg.connect(tone);
        tone.connect(out);
        out.connect(pan);
        out.connect(an);
        out.connect(delay); delay.connect(fb).connect(delay); delay.connect(dw).connect(pan);
        [o1, o2, lfo].forEach((o) => o.start());
        this.v = { o1, o2, lfoG, f, sg, tone, out, pan };
    }

    // Runs inside the pointer / camera event, so notes start the instant you pinch.
    onHands(hands) {
        if (!this.v) return;
        const present = hands.filter((h) => h.present);
        const right = present.length ? present.reduce((a, b) => (b.x > a.x ? b : a)) : null;
        const left = present.length === 2 ? present.find((h) => h !== right) : null;
        const inst = INST[ui.get().thereminInst] || INSTRUMENTS[0];
        const song = SONGS.find((x) => x.id === ui.get().thereminSong);
        if (song !== this.song) { this.song = song; this.songPos = 0; }

        // Left pinch flips to the next instrument (camera only; the mouse has the dock and keys).
        const lp = !!left?.pinch && this.stage.tracker.mode === 'camera';
        if (lp && !this.leftPinch) pickInstrument(1);
        this.leftPinch = lp;

        // Hand height picks a white key. The note only changes once you've moved
        // well past the halfway line, so a shaky hand doesn't flicker between keys.
        let changed = false;
        if (right) {
            const raw = clamp((0.92 - right.y) / 0.84, 0, 1) * (N_DEG - 1);
            if (this.deg === null || Math.abs(raw - this.deg) > 0.68) {
                const d = Math.round(raw);
                changed = d !== this.deg;
                this.deg = d;
            }
        }
        const pinch = !!right?.pinch;
        const started = pinch && !this.playing;
        // A pinch that starts on a button is a button press, not a note.
        if (started) this.onUI = !!document.elementFromPoint(right.x * innerWidth, right.y * innerHeight)?.closest?.('[data-hand]');
        this.playing = pinch;
        if (this.onUI) { if (!pinch) this.onUI = false; return; }

        const ctx = audio.ctx, now = ctx.currentTime, v = this.v;
        if (started || (pinch && changed)) {
            let midi = degToMidi(this.deg);
            if (song) {
                // Any key plays the next song note. Hand height only shifts the octave.
                midi = song.notes[this.songPos].midi + (this.deg < 4 ? -12 : this.deg > 10 ? 12 : 0);
                this.songPos = (this.songPos + 1) % song.notes.length;
                ui.set({ thereminSongPos: this.songPos });
            }
            this.midi = midi;
            const hz = midiToHz(midi + (inst.octave || 0));
            if (inst.kind === 'hold') {
                const glide = started ? 0.002 : inst.glide;
                v.o1.frequency.setTargetAtTime(hz, now, glide);
                v.o2.frequency.setTargetAtTime(hz, now, glide);
                v.sg.gain.setTargetAtTime(0.9, now, inst.attack / 3);
            } else {
                // Earlier notes ring briefly under the new one, then fade.
                for (const n of this.notes) release(ctx, n, 0.5);
                this.notes = this.notes.filter((n) => n.end > now);
                this.notes.push(strike(ctx, v.tone, inst, midi + (inst.octave || 0)));
            }
            this.hit = 1;
            coachDone('play');
        }
        if (!pinch) {
            v.sg.gain.setTargetAtTime(0, now, 0.06);
            if (this.notes.length) { this.notes.forEach((n) => release(ctx, n, 0.6)); this.notes = []; }
        }
    }

    update(dt, t, frame) {
        const st = this.stage;
        const inst = INST[ui.get().thereminInst] || INSTRUMENTS[0];
        const present = frame.hands.filter((h) => h.present);
        const right = present.length ? present.reduce((a, b) => (b.x > a.x ? b : a)) : null;
        const left = present.length === 2 ? present.find((h) => h !== right) : null;

        let vol = 0.75;
        if (left) {
            vol = clamp(1.1 - left.y * 1.2, 0, 1);
            if (Math.abs(left.y - 0.5) > 0.2) coachDone('volume');
        }
        const deg = clamp(midiToDeg(this.midi), 0, N_DEG - 1);
        this.disp += (deg - this.disp) * damp(18, dt);

        let held = 0;
        if (this.v) {
            const ct = audio.ctx.currentTime, v = this.v;
            if (inst.kind === 'hold') {
                held = this.playing && !this.onUI ? 1 : 0;
                v.o1.type = inst.waves[0];
                v.o2.type = inst.waves[1];
                v.o2.detune.value = inst.detune;
                v.f.frequency.setTargetAtTime(inst.cutoff, ct, 0.05);
                const hz = midiToHz(this.midi + (inst.octave || 0));
                v.lfoG.gain.setTargetAtTime(hz * inst.vibrato * (right && right.fingers >= 4 ? 2.5 : 1), ct, 0.2);
            } else {
                v.sg.gain.setTargetAtTime(0, ct, 0.03);
            }
            v.out.gain.setTargetAtTime(vol * 0.3, ct, 0.05);
            v.tone.frequency.setTargetAtTime(1800 + clamp((right?.z ?? 0) + 0.5, 0, 1.5) * 5000, ct, 0.05);
            if (right) audio.place(v.pan, st.pointAtZ(right.x, right.y, -0.5, this._v));
        }
        this.hit *= Math.exp(-dt * 3);
        const level = Math.max(held, this.hit) * vol;
        this.level += (level - this.level) * damp(20, dt);

        // Visuals
        this.hue = (this.disp / (N_DEG - 1)) * 0.75 + 0.5;
        const col = new THREE.Color().setHSL(this.hue % 1, 0.7, 0.62);
        this.marker.position.y = this.degToY(this.disp);
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
        // Show the key under your hand; in a song, show the song note you just played.
        const shown = this.song ? (this.hit > 0.05 || this.playing ? this.midi : null) : right ? degToMidi(this.deg ?? 4) : null;
        const name = shown === null ? null : noteName(shown);
        if (ui.get().thereminNote !== name) ui.set({ thereminNote: name });
    }

    resize() {
        for (const m of [this.waveMat, this.waveHaloMat]) m?.resolution.set(this.stage.container.clientWidth, this.stage.container.clientHeight);
    }

    dispose() {
        window.removeEventListener('keydown', this.onKey);
        this.offInput();
        this.waveGeo?.dispose();
        this.waveMat?.dispose();
        this.waveHaloMat?.dispose();
        this.stage.scene.remove(this.root);
        this.root.traverse((o) => { if (o.isCSS2DObject) o.element.remove(); });
        if (this.v) {
            const ct = audio.ctx.currentTime;
            this.notes.forEach((n) => release(audio.ctx, n, 0.2));
            this.v.out.gain.setTargetAtTime(0, ct, 0.05);
            [this.v.o1, this.v.o2].forEach((o) => o.stop(ct + 0.4));
        }
        ui.set({ thereminNote: null });
    }
}
