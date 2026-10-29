// All sounds are synthesised live with Web Audio, and each one is placed in 3D
// (HRTF panning), so a photo on the left sounds like it's on the left.
class AudioEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (this.ctx) { this.ctx.resume(); return; }
        const ctx = (this.ctx = new AudioContext());
        this.master = ctx.createGain();
        this.master.gain.value = 0.8;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        this.master.connect(comp).connect(ctx.destination);

        // Small generated room reverb.
        this.reverb = ctx.createConvolver();
        this.reverb.buffer = this._impulse(2.2, 2.5);
        this.wet = ctx.createGain();
        this.wet.gain.value = 0.28;
        this.reverb.connect(this.wet).connect(this.master);

        this.bus = ctx.createGain();
        this.bus.connect(this.master);
        this.bus.connect(this.reverb);
    }

    _impulse(seconds, decay) {
        const rate = this.ctx.sampleRate, len = rate * seconds;
        const buf = this.ctx.createBuffer(2, len, rate);
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return buf;
    }

    setListener(x, y, z) {
        if (!this.ctx) return;
        const l = this.ctx.listener;
        if (l.positionX) {
            l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z;
        } else l.setPosition(x, y, z);
    }

    panner(pos) {
        const p = this.ctx.createPanner();
        p.panningModel = 'HRTF';
        p.distanceModel = 'inverse';
        p.refDistance = 2;
        p.rolloffFactor = 0.6;
        if (pos) this.place(p, pos);
        p.connect(this.bus);
        return p;
    }

    place(p, pos) {
        if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
        else p.setPosition(pos.x, pos.y, pos.z);
    }

    get ready() { return this.ctx && this.enabled && this.ctx.state === 'running'; }

    tone({ freq = 440, to = null, type = 'sine', dur = 0.15, gain = 0.2, attack = 0.005, pos = null, delay = 0 }) {
        if (!this.ready) return;
        const ctx = this.ctx, t = ctx.currentTime + delay;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(gain, t + attack);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(pos ? this.panner(pos) : this.bus);
        o.start(t);
        o.stop(t + dur + 0.05);
    }

    noise({ dur = 0.4, from = 4000, to = 200, gain = 0.25, q = 1, pos = null }) {
        if (!this.ready) return;
        const ctx = this.ctx, t = ctx.currentTime;
        const len = Math.ceil(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = q;
        f.frequency.setValueAtTime(from, t);
        f.frequency.exponentialRampToValueAtTime(to, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f).connect(g).connect(pos ? this.panner(pos) : this.bus);
        src.start(t);
    }

    // ---- named sounds ----
    hover(pos, pitch = 1) { this.tone({ freq: 1400 * pitch, type: 'sine', dur: 0.06, gain: 0.05, pos }); }
    grab(pos) {
        this.tone({ freq: 220, to: 660, type: 'triangle', dur: 0.18, gain: 0.16, pos });
        this.noise({ dur: 0.2, from: 800, to: 5000, gain: 0.05, pos });
    }
    release(pos) { this.tone({ freq: 660, to: 330, type: 'sine', dur: 0.2, gain: 0.12, pos }); }
    whoosh(pos, speed = 1) { this.noise({ dur: 0.35, from: 300, to: 3000 * Math.min(2, speed), gain: 0.12, q: 2, pos }); }
    chime(pos, root = 523.25) {
        [1, 1.25, 1.5, 2].forEach((m, i) =>
            this.tone({ freq: root * m, type: 'sine', dur: 0.9, gain: 0.08, delay: i * 0.05, pos }));
    }
    focus(pos) {
        this.tone({ freq: 196, to: 392, type: 'sine', dur: 0.5, gain: 0.14, pos });
        this.tone({ freq: 294, to: 588, type: 'triangle', dur: 0.5, gain: 0.06, pos, delay: 0.04 });
    }
    dissolve(pos) {
        this.noise({ dur: 0.9, from: 6000, to: 120, gain: 0.25, q: 0.7, pos });
        this.tone({ freq: 440, to: 55, type: 'sawtooth', dur: 0.7, gain: 0.06, pos });
    }
    click() { this.tone({ freq: 880, type: 'square', dur: 0.04, gain: 0.05 }); this.tone({ freq: 1760, type: 'sine', dur: 0.08, gain: 0.05, delay: 0.02 }); }
    boot() {
        [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) =>
            this.tone({ freq: f, type: 'sine', dur: 1.4, gain: 0.07, delay: i * 0.09 }));
    }
}

export const audio = new AudioEngine();
