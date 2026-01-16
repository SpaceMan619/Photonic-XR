// Basic Sound Manager for Photonic XR
const SOUNDS = {
    GRAB: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', // Pop
    SORT: 'https://assets.mixkit.co/active_storage/sfx/2040/2040-preview.mp3', // Whoosh/Swipe
    DELETE: 'https://assets.mixkit.co/active_storage/sfx/2005/2005-preview.mp3', // Thud/Crumple
};

class SoundManager {
    constructor() {
        this.cache = {};
        this.enabled = true;
    }

    play(soundKey) {
        if (!this.enabled) return;

        const url = SOUNDS[soundKey];
        if (!url) return;

        if (!this.cache[url]) {
            this.cache[url] = new Audio(url);
        }

        const audio = this.cache[url];
        audio.currentTime = 0;
        audio.play().catch(e => console.log("Audio play blocked (user must interact first)"));
    }

    toggle(state) {
        this.enabled = state;
    }
}

export const soundManager = new SoundManager();
export const SOUND_KEYS = {
    GRAB: 'GRAB',
    SORT: 'SORT',
    DELETE: 'DELETE'
};
