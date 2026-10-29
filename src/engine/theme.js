import * as THREE from 'three';

// "Ethereal daydream" (shared with Dreamloom): soft white-blue sky, periwinkle glow,
// soft ink instead of black, rose / mint / lilac accents.
export const THEME = {
    bg: '#eef4ff',
    mist: '#dbe8ff',
    glow: '#a8c9ff',
    sky: '#7fa8ff',
    ink: '#24304a',
    inkSoft: '#55627d',
    rose: '#d76a86',
    mint: '#4bb58a',
    lilac: '#a58cff',
    peach: '#f2a65a',
};

// Category / accent colours, deep enough to read on a pale background.
export const PALETTE = [THEME.sky, THEME.rose, THEME.peach, THEME.mint, THEME.lilac, '#5bb8d6'];

export const color = (hex) => new THREE.Color(hex);
