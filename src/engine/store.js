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
    demo: null,             // galaxy | draw | theremin
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
    thereminSnap: true,
    thereminNote: null,
    photoSet: null,         // 'local' | 'demo'
    categories: [],
    counts: {},
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
