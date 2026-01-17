// Basic Sound Manager for Photonic XR
const SOUNDS = {
    GRAB: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3', // Pop
    SORT: '',
    DELETE: '/audio/delete.wav',
    DROP: '/audio/click.wav',
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

        try {
            if (!this.cache[url]) {
                const audio = new Audio(url);
                audio.load();
                this.cache[url] = audio;
            }

            const audio = this.cache[url];
            audio.currentTime = 0;
            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.warn(`SoundManager: Play failed for ${soundKey}:`, e.message);
                });
            }
        } catch (err) {
            console.error(`SoundManager: Error playing ${soundKey}:`, err);
        }
    }

    toggle(state) {
        this.enabled = state;
    }
}

export const soundManager = new SoundManager();
export const SOUND_KEYS = {
    GRAB: 'GRAB',
    SORT: 'SORT',
    DELETE: 'DELETE',
    DROP: 'DROP'
};
