// One Euro filter (Casiez et al. 2012): smooth when still, responsive when moving.
// Much better than a fixed EMA for hand cursors: no jitter at rest, little lag in motion.
class LowPass {
    constructor() { this.y = null; }
    filter(x, a) {
        this.y = this.y === null ? x : a * x + (1 - a) * this.y;
        return this.y;
    }
}

export class OneEuro {
    constructor(minCutoff = 1.0, beta = 0.0, dCutoff = 1.0) {
        this.minCutoff = minCutoff;
        this.beta = beta;
        this.dCutoff = dCutoff;
        this.x = new LowPass();
        this.dx = new LowPass();
        this.last = null;
    }
    static alpha(cutoff, dt) {
        const tau = 1 / (2 * Math.PI * cutoff);
        return 1 / (1 + tau / dt);
    }
    filter(value, t) {
        if (this.last === null) {
            this.last = t;
            this.dx.y = 0;
            return this.x.filter(value, 1);
        }
        const dt = Math.max(1e-3, t - this.last);
        this.last = t;
        const prev = this.x.y;
        const d = (value - prev) / dt;
        const ed = this.dx.filter(d, OneEuro.alpha(this.dCutoff, dt));
        const cutoff = this.minCutoff + this.beta * Math.abs(ed);
        return this.x.filter(value, OneEuro.alpha(cutoff, dt));
    }
    reset() { this.x = new LowPass(); this.dx = new LowPass(); this.last = null; }
}

export class OneEuro3 {
    constructor(...args) { this.f = [new OneEuro(...args), new OneEuro(...args), new OneEuro(...args)]; }
    filter(v, t) { return [this.f[0].filter(v[0], t), this.f[1].filter(v[1], t), this.f[2].filter(v[2], t)]; }
    reset() { this.f.forEach((f) => f.reset()); }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const remap = (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c);
// Frame-rate independent smoothing factor.
export const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);
