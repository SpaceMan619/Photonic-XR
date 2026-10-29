import * as THREE from 'three';
import { ui, coachDone } from '../engine/store';
import { audio } from '../engine/audio';
import { clamp, damp } from '../engine/filters';
import { SONGS, midiToHz, letter, voice } from './music';

// You conduct; the choir sings the song by itself in four parts (bass, tenor, alto, soprano).
// Hand height = how loud, left-right = the vowel they sing, pinch = hold the note,
// fist = cut them off, left hand height (or ↑ ↓) = tempo.
const PARTS = [
    { name: 'Bass', gain: 0.8, hue: 0.62, vib: 4.6 },
    { name: 'Tenor', gain: 0.65, hue: 0.72, vib: 5.1 },
    { name: 'Alto', gain: 0.65, hue: 0.9, vib: 5.4 },
    { name: 'Soprano', gain: 0.9, hue: 0.98, vib: 5.8 },
];
// Formant frequencies (Hz) and names, left to right across the screen.
const VOWELS = [
    { name: 'oo', f: [325, 700, 2530] },
    { name: 'oh', f: [450, 800, 2830] },
    { name: 'ah', f: [800, 1150, 2900] },
    { name: 'eh', f: [530, 1700, 2600] },
    { name: 'ee', f: [290, 1870, 2800] },
];
const DYN = ['pp', 'p', 'mp', 'mf', 'f', 'ff'];
const LOOKAHEAD = 0.12;

function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
}

export function changeTempo(step) {
    const tempo = clamp(Math.round((ui.get().choirTempo + step) * 10) / 10, 0.5, 1.6);
    ui.set({ choirTempo: tempo });
}

export class ChoirDemo {
    constructor(stage) {
        this.stage = stage;
        this.root = new THREE.Group();
        stage.scene.add(this.root);
        this.dyn = 0.5;
        this.vowel = 2;
        this.held = false;
        this.cut = false;
        this.pos = 0;
        this.current = [45, 55, 60, 64];
        this.pulse = [0, 0, 0, 0];
        this.onKey = (e) => {
            if (e.key === 'ArrowUp') { changeTempo(0.1); e.preventDefault(); }
            if (e.key === 'ArrowDown') { changeTempo(-0.1); e.preventDefault(); }
        };
        window.addEventListener('keydown', this.onKey);
        this.offInput = stage.tracker.onInput((hands) => this.onHands(hands));
    }

    init() {
        const st = this.stage, W = st.W;
        const tex = (this.tex = glowTexture());
        this.orbs = PARTS.map((p, i) => {
            const col = new THREE.Color().setHSL(p.hue % 1, 0.65, 0.66);
            const core = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: col }));
            const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false, opacity: 0.7 }));
            const g = new THREE.Group();
            g.add(halo, core);
            g.position.set((i / 3 - 0.5) * W * 0.62, 0, -2);
            this.root.add(g);
            return { g, core, halo, col, y: 0 };
        });
        this.makeChoir();
        st.setRoomTint('#b8a8ff', 1);
        this.setSong(ui.get().choirSong);
    }

    makeChoir() {
        if (!audio.ctx) return;
        const ctx = audio.ctx;
        // All voices share one mouth: a bank of three vowel filters.
        const pre = ctx.createGain();
        pre.gain.value = 0.18;
        const mouth = ctx.createGain();
        this.formants = [0, 1, 2].map((i) => {
            const bp = ctx.createBiquadFilter(), g = ctx.createGain();
            bp.type = 'bandpass';
            bp.Q.value = [5, 8, 10][i];
            g.gain.value = [1, 0.55, 0.3][i];
            pre.connect(bp).connect(g).connect(mouth);
            return bp;
        });
        const warm = ctx.createBiquadFilter();
        warm.type = 'lowpass';
        warm.frequency.value = 3000;
        const out = ctx.createGain();
        out.gain.value = 0;
        mouth.connect(warm).connect(out);
        const pan = audio.panner(new THREE.Vector3(0, 0.3, -2));
        out.connect(pan);
        const an = (this.analyser = ctx.createAnalyser());
        an.fftSize = 256;
        out.connect(an);
        this.levels = new Uint8Array(an.frequencyBinCount);

        // Each part: three slightly detuned saws (a section, not a soloist) with gentle vibrato.
        this.voices = PARTS.map((p) => {
            const g = ctx.createGain();
            g.gain.value = 0;
            const lfo = ctx.createOscillator(), lg = ctx.createGain();
            lfo.frequency.value = p.vib;
            lg.gain.value = 14;
            lfo.connect(lg);
            const oscs = [-11, 0, 9].map((cents) => {
                const o = ctx.createOscillator();
                o.type = 'sawtooth';
                o.detune.value = cents;
                lg.connect(o.detune);
                o.connect(g);
                o.start();
                return o;
            });
            lfo.start();
            g.connect(pre);
            return { g, oscs, lfo, part: p };
        });
        this.out = out;
        this.warm = warm;
        this.timer = setInterval(() => this.schedule(), 25);
    }

    setSong(id) {
        this.song = SONGS.find((s) => s.id === id) || SONGS[0];
        this.pos = 0;
        this.nextTime = audio.ctx ? audio.ctx.currentTime + 0.3 : 0;
    }

    // Look-ahead scheduler on the audio clock: notes land exactly on the beat,
    // however busy the screen is.
    schedule() {
        if (!this.voices) return;
        const ctx = audio.ctx, now = ctx.currentTime;
        if (ui.get().choirSong !== this.song.id) this.setSong(ui.get().choirSong);
        if (this.held || this.cut) { this.nextTime = Math.max(this.nextTime, now + 0.05); return; }
        if (this.nextTime < now - 0.2) this.nextTime = now + 0.05; // tab was asleep
        const beat = 60 / (this.song.bpm * ui.get().choirTempo);
        while (this.nextTime < now + LOOKAHEAD) {
            const n = this.song.notes[this.pos];
            this.sing(voice(n.midi + (this.song.notes[0].midi < 57 ? 12 : 0), n.chord), this.nextTime);
            this.nextTime += n.beats * beat;
            this.pos = (this.pos + 1) % this.song.notes.length;
            if (this.pos === 0) this.nextTime += beat; // a breath before it starts again
        }
    }

    sing(midis, t) {
        const now = audio.ctx.currentTime;
        midis.forEach((m, i) => {
            const v = this.voices[i];
            const moved = m !== this.current[i];
            if (moved) v.oscs.forEach((o) => o.frequency.setTargetAtTime(midiToHz(m), t, 0.025));
            // Re-sing the melody every note, the lower parts only when their note changes.
            if (moved || i === 3) {
                v.g.gain.setTargetAtTime(v.part.gain * 0.35, Math.max(now, t - 0.06), 0.015);
                v.g.gain.setTargetAtTime(v.part.gain, t, 0.05);
            }
            this.current[i] = m;
        });
        const delay = Math.max(0, (t - now) * 1000);
        setTimeout(() => {
            midis.forEach((m, i) => { if (i === 3 || m !== this.shown?.[i]) this.pulse[i] = 1; });
            this.shown = midis;
            ui.set({ choirPos: this.pos, choirNote: letter(midis[3]) });
        }, delay);
    }

    // Instant gestures, straight from the input event.
    onHands(hands) {
        const present = hands.filter((h) => h.present);
        const right = present.length ? present.reduce((a, b) => (b.x > a.x ? b : a)) : null;
        const left = present.length === 2 ? present.find((h) => h !== right) : null;
        const overUI = right && document.elementFromPoint(right.x * innerWidth, right.y * innerHeight)?.closest?.('[data-hand]');
        const held = !!right?.pinch && !overUI;
        const cut = !!right?.fist;
        if (held && !this.held) coachDone('hold');
        if (cut && !this.cut) coachDone('cut');
        this.held = held;
        this.cut = cut;
        if (left && this.stage.tracker.mode === 'camera') {
            const tempo = Math.round(clamp(1.5 - left.y * 1.1, 0.5, 1.6) * 10) / 10;
            if (tempo !== ui.get().choirTempo) ui.set({ choirTempo: tempo });
        }
    }

    update(dt, t, frame) {
        const st = this.stage;
        const present = frame.hands.filter((h) => h.present);
        const right = present.length ? present.reduce((a, b) => (b.x > a.x ? b : a)) : null;

        // With no hand up the choir carries on at a calm mezzo-forte.
        const dynT = right ? clamp((0.95 - right.y) / 0.85, 0, 1) : 0.5;
        const vowT = right ? clamp(right.x, 0, 1) * (VOWELS.length - 1) : 2;
        this.dyn += (dynT - this.dyn) * damp(6, dt);
        this.vowel += (vowT - this.vowel) * damp(5, dt);
        if (right && Math.abs(dynT - 0.5) > 0.3) coachDone('loud');
        if (right && Math.abs(vowT - 2) > 1.4) coachDone('vowel');

        if (this.out) {
            const ct = audio.ctx.currentTime;
            this.out.gain.setTargetAtTime(this.cut ? 0 : 0.05 + this.dyn * 0.55, ct, this.cut ? 0.04 : 0.08);
            // Louder choirs are brighter, like real voices.
            this.warm.frequency.setTargetAtTime(1400 + this.dyn * 4200, ct, 0.1);
            const a = Math.floor(this.vowel), b = Math.min(a + 1, VOWELS.length - 1), k = this.vowel - a;
            this.formants.forEach((f, i) => f.frequency.setTargetAtTime(VOWELS[a].f[i] * (1 - k) + VOWELS[b].f[i] * k, ct, 0.05));
        }

        // Visuals: one glowing orb per part, rising and falling with its note.
        if (this.analyser) this.analyser.getByteFrequencyData(this.levels);
        let energy = 0;
        if (this.levels) for (let i = 2; i < 40; i++) energy += this.levels[i];
        energy = this.cut ? 0 : Math.min(1, energy / (38 * 160));
        this.orbs.forEach((o, i) => {
            this.pulse[i] *= Math.exp(-dt * 4);
            const ty = ((this.current[i] - 60) / 30) * st.H * 0.5;
            o.y += (ty - o.y) * damp(8, dt);
            o.g.position.y = o.y + Math.sin(t * 1.3 + i) * 0.03;
            const s = 0.07 + energy * 0.08 + this.pulse[i] * 0.05;
            o.core.scale.setScalar(s);
            o.halo.scale.setScalar(s * (6 + this.dyn * 6));
            o.halo.material.opacity = 0.25 + energy * 0.6;
        });
        const hue = 0.55 + (this.vowel / (VOWELS.length - 1)) * 0.4;
        st.setRoomTint(new THREE.Color().setHSL(hue % 1, 0.55, 0.7), 0.7 + energy * 0.9);

        const info = {
            dyn: this.cut ? 'silent' : DYN[Math.round(this.dyn * (DYN.length - 1))],
            vowel: VOWELS[Math.round(this.vowel)].name,
            held: this.held,
            bpm: Math.round(this.song.bpm * ui.get().choirTempo),
        };
        const old = ui.get().choirInfo;
        if (!old || old.dyn !== info.dyn || old.vowel !== info.vowel || old.held !== info.held || old.bpm !== info.bpm) ui.set({ choirInfo: info });
    }

    dispose() {
        window.removeEventListener('keydown', this.onKey);
        this.offInput();
        clearInterval(this.timer);
        this.stage.scene.remove(this.root);
        this.tex?.dispose();
        if (this.voices) {
            const ct = audio.ctx.currentTime;
            this.out.gain.setTargetAtTime(0, ct, 0.08);
            this.voices.forEach((v) => { v.oscs.forEach((o) => o.stop(ct + 0.6)); v.lfo.stop(ct + 0.6); });
        }
        ui.set({ choirInfo: null, choirNote: null });
    }
}

