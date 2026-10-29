// Shared music bits for the Air Theremin and the Choir: notes, songs, instruments.

export const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const SCALE = [0, 2, 4, 5, 7, 9, 11];  // the white piano keys
export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = (m) => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
export const letter = (m) => NAMES[((m % 12) + 12) % 12];

// "hit" and "fm" instruments strike a fresh note each time (piano-like).
// "hold" instruments sing one long note and slide to the next.
export const INSTRUMENTS = [
    { id: 'piano', name: 'Piano', icon: '🎹', kind: 'hit', decay: 2.4, bright: 4200, partials: [[1, 'triangle', 0.55], [2, 'sine', 0.22], [3, 'sine', 0.07]] },
    { id: 'keys', name: 'E-Piano', icon: '✨', kind: 'fm', decay: 2.6, ratio: 1, index: 2.2, bright: 3000 },
    { id: 'bells', name: 'Bells', icon: '🔔', kind: 'fm', decay: 3.2, ratio: 3.5, index: 3, bright: 6000, octave: 12 },
    { id: 'marimba', name: 'Marimba', icon: '🪵', kind: 'hit', decay: 0.9, bright: 5000, partials: [[1, 'sine', 0.8], [4, 'sine', 0.2], [10, 'sine', 0.04]] },
    { id: 'harp', name: 'Harp', icon: '🪕', kind: 'hit', decay: 1.8, bright: 5200, partials: [[1, 'sawtooth', 0.32], [2, 'sine', 0.12]] },
    { id: 'strings', name: 'Strings', icon: '🎻', kind: 'hold', waves: ['sawtooth', 'sawtooth'], detune: 9, attack: 0.12, cutoff: 1800, vibrato: 0.004, glide: 0.04 },
    { id: 'flute', name: 'Flute', icon: '🪈', kind: 'hold', waves: ['sine', 'triangle'], detune: 2, attack: 0.04, cutoff: 3200, vibrato: 0.005, glide: 0.025, octave: 12 },
    { id: 'theremin', name: 'Theremin', icon: '〰️', kind: 'hold', waves: ['sine', 'sine'], detune: 3, attack: 0.02, cutoff: 2600, vibrato: 0.008, glide: 0.06 },
];

// Songs are "note:beats" pairs. Chords are worked out automatically for the choir.
const RAW_SONGS = [
    {
        id: 'twinkle', name: 'Twinkle Twinkle', bpm: 84,
        notes: 'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2',
    },
    {
        id: 'ode', name: 'Ode to Joy', bpm: 88,
        notes: 'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2 E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2',
    },
    {
        id: 'mary', name: 'Mary Had a Lamb', bpm: 92,
        notes: 'E4:1 D4:1 C4:1 D4:1 E4:1 E4:1 E4:2 D4:1 D4:1 D4:2 E4:1 G4:1 G4:2 E4:1 D4:1 C4:1 D4:1 E4:1 E4:1 E4:1 E4:1 D4:1 D4:1 E4:1 D4:1 C4:4',
    },
    {
        id: 'birthday', name: 'Happy Birthday', bpm: 96,
        notes: 'G3:0.75 G3:0.25 A3:1 G3:1 C4:1 B3:2 G3:0.75 G3:0.25 A3:1 G3:1 D4:1 C4:2 G3:0.75 G3:0.25 G4:1 E4:1 C4:1 B3:1 A3:2 F4:0.75 F4:0.25 E4:1 C4:1 D4:1 C4:3',
    },
    {
        id: 'elise', name: 'Für Elise', bpm: 72, minor: true,
        notes: 'E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 G#4:0.5 B4:0.5 C5:1.5 E4:0.5 E5:0.5 D#5:0.5 E5:0.5 D#5:0.5 E5:0.5 B4:0.5 D5:0.5 C5:0.5 A4:1.5 C4:0.5 E4:0.5 A4:0.5 B4:1.5 E4:0.5 C5:0.5 B4:0.5 A4:2',
    },
];

function parseNote(n) {
    const [, l, sharp, oct] = n.match(/([A-G])(#?)(\d)/);
    return (+oct + 1) * 12 + NAMES.indexOf(l) + (sharp ? 1 : 0);
}

const CHORDS = {
    C: [0, 4, 7], G: [7, 11, 2], F: [5, 9, 0], Am: [9, 0, 4], Dm: [2, 5, 9], Em: [4, 7, 11], E: [4, 8, 11],
};
const MAJOR_ORDER = ['C', 'G', 'F', 'Am', 'Dm', 'Em'];
const MINOR_ORDER = ['Am', 'E', 'Dm', 'C', 'G', 'F'];

// Simple hymn-style harmony: keep the chord while it fits the melody,
// let short notes pass over it, otherwise pick the most common chord that fits.
function harmonize(notes, minor) {
    const order = minor ? MINOR_ORDER : MAJOR_ORDER;
    let prev = null;
    return notes.map(({ midi, beats }) => {
        const pc = midi % 12;
        const fits = (c) => CHORDS[c].includes(pc);
        if (prev && (fits(prev) || beats < 1)) return prev;
        prev = order.find(fits) || prev || order[0];
        return prev;
    });
}

export const SONGS = RAW_SONGS.map((s) => {
    const notes = s.notes.split(' ').map((tok) => {
        const [n, b] = tok.split(':');
        return { midi: parseNote(n), beats: +b };
    });
    const chords = harmonize(notes, s.minor);
    notes.forEach((n, i) => { n.chord = chords[i]; });
    return { ...s, notes };
});

// Four-part choir voicing for one melody note: bass, tenor, alto, soprano.
// Bass sings the chord's root; alto and tenor fill in the chord tones the melody isn't on.
export function voice(melody, chord) {
    const tones = CHORDS[chord];
    const nearest = (target, lo, hi, pcs) => {
        let best = null, bd = 99;
        for (let m = lo; m <= hi; m++) {
            if (!pcs.includes(m % 12)) continue;
            if (Math.abs(m - target) < bd) { bd = Math.abs(m - target); best = m; }
        }
        return best;
    };
    const bass = nearest(43, 36, 50, [tones[0]]);
    const others = tones.filter((pc) => pc !== melody % 12);
    const alto = nearest(melody - 5, melody - 9, melody - 3, others) ?? nearest(melody - 5, melody - 9, melody - 3, tones) ?? melody - 12;
    const left = others.filter((pc) => pc !== alto % 12);
    const tenor = nearest(55, Math.max(bass + 3, 48), alto - 2, left.length ? left : tones) ?? alto - 12;
    return [bass, tenor, alto, melody];
}

// Strike one note on a "hit" or "fm" instrument. Returns a handle for release().
export function strike(ctx, dest, inst, midi, when = ctx.currentTime, vel = 1) {
    const t = when, hz = midiToHz(midi);
    const env = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(inst.bright, t);
    lp.frequency.exponentialRampToValueAtTime(700, t + inst.decay * 0.6);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vel, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, t + inst.decay);
    lp.connect(env).connect(dest);
    const oscs = [];
    if (inst.kind === 'fm') {
        const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), cg = ctx.createGain();
        car.frequency.value = hz;
        mod.frequency.value = hz * inst.ratio;
        mg.gain.setValueAtTime(hz * inst.index, t);
        mg.gain.exponentialRampToValueAtTime(hz * inst.index * 0.08 + 0.01, t + inst.decay * 0.35);
        mod.connect(mg).connect(car.frequency);
        cg.gain.value = 0.6;
        car.connect(cg).connect(lp);
        oscs.push(car, mod);
    } else {
        // Higher partials die away faster, like a real struck string or bar.
        for (const [ratio, type, amp] of inst.partials) {
            const o = ctx.createOscillator(), pg = ctx.createGain();
            o.type = type;
            o.frequency.value = hz * ratio;
            pg.gain.setValueAtTime(amp, t);
            pg.gain.exponentialRampToValueAtTime(0.0001, t + inst.decay / Math.sqrt(ratio));
            o.connect(pg).connect(lp);
            oscs.push(o);
        }
    }
    oscs.forEach((o) => { o.start(t); o.stop(t + inst.decay + 0.05); });
    return { env, oscs, end: t + inst.decay };
}

export function release(ctx, n, time) {
    const t = ctx.currentTime;
    if (n.released || n.end <= t) return;
    n.released = true;
    n.env.gain.cancelScheduledValues(t);
    n.env.gain.setTargetAtTime(0, t, time / 4);
    n.oscs.forEach((o) => { try { o.stop(t + time + 0.05); } catch { /* already stopping */ } });
}
