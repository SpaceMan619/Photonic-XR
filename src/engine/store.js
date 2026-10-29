import { useSyncExternalStore } from 'react';

// Tiny shared store so the three.js loop and the React HUD can talk
// without re-rendering React every frame.
export function createStore(initial) {
    let state = initial;
    const subs = new Set();
    return {
        get: () => state,
        set: (patch) => {
            const next = typeof patch === 'function' ? patch(state) : patch;
            let changed = false;
            for (const k in next) if (state[k] !== next[k]) { changed = true; break; }
            if (!changed) return;
            state = { ...state, ...next };
            subs.forEach((f) => f(state));
        },
        subscribe: (f) => { subs.add(f); return () => subs.delete(f); },
    };
}

export const ui = createStore({
    screen: 'start',        // start | menu | demo
    demo: null,             // galaxy | draw | theremin | choir | splats
    input: 'none',          // none | loading | camera | mouse | error
    inputError: null,
    galaxyMode: 'galaxy',   // galaxy | sort
    focused: null,          // photo id in focus view
    hovered: null,          // { id, category, confidence }
    hands: 0,
    face: false,
    fps: 0,
    debug: false,
    coach: {},              // coach step id -> true when done
    toast: null,
    drawMirror: false,
    thereminInst: 'piano',  // see INSTRUMENTS in demos/theremin.js
    thereminSong: null,     // null = free play, else a SONGS id
    thereminSongPos: 0,
    choirSong: 'ode',
    choirTempo: 1,          // speed multiplier on the song's own tempo
    choirInfo: null,        // { dyn, vowel, held, bpm }
    choirNote: null,
    choirPos: 0,
    thereminNote: null,
    photoSet: null,         // 'local' | 'demo'
    categories: [],
    counts: {},
    splatList: [],          // [{ id, name, kind, line, local }]
    splatIndex: 0,
    splatStatus: 'idle',    // idle | loading | ready | error
    splatProgress: 0,       // 0..100
    splatCount: 0,          // splats in the shown scene
    splatPortal: false,     // black void + lit frame, so things seem to come out of the screen
});

export const useUI = (selector) =>
    useSyncExternalStore(ui.subscribe, () => selector(ui.get()));

let toastTimer;
export function toast(text, ms = 2200) {
    ui.set({ toast: text });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.set({ toast: null }), ms);
}

export function coachDone(step) {
    const c = ui.get().coach;
    if (!c[step]) ui.set({ coach: { ...c, [step]: true } });
}
