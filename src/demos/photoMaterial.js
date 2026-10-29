import * as THREE from 'three';
import { THEME } from '../engine/theme';

// A photo rebuilt as real 3D. Depth Pro gives each pixel a distance in metres and the
// camera's field of view, so every vertex goes back onto its true line of sight:
// faces bulge, people stand clear of the scenery, hills sit far away.
//
// Where depth jumps (a person's outline) the surface would stretch into a smeared
// curtain; instead it fades out, so people float clear of the scene with a soft gap
// of sky behind them as you lean.
// Opened photos get the fine grid; the 31 in the overview use a quarter of the vertices.
export const PHOTO_GEO = new THREE.PlaneGeometry(1, 1, 128, 128);
export const PHOTO_GEO_LO = new THREE.PlaneGeometry(1, 1, 64, 64);

export function makePhotoMaterial({ map, depth, meta, glow }) {
    // Where the subject sits in the 0..1 log-depth range (matches the encoding in prepare_photos.py).
    const focusT = meta ? Math.log(meta.focus / meta.near) / Math.log(meta.far / meta.near) : 0.4;
    return new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
            uMap: { value: map },
            uDepth: { value: depth },
            uFocusT: { value: focusT },
            uDepthRange: { value: 0.9 },
            uDepthAmt: { value: 0.35 },
            uHover: { value: 0 },
            uDissolve: { value: 0 },
            uOpacity: { value: 1 },
            uTime: { value: 0 },
            uWarn: { value: 0 },
            uGlow: { value: new THREE.Color(glow) },
            uFog: { value: new THREE.Color(THEME.bg) },
        },
        vertexShader: /* glsl */`
            uniform sampler2D uDepth; uniform float uFocusT; uniform float uDepthRange;
            uniform float uDepthAmt; uniform float uDissolve;
            varying vec2 vUv; varying float vL; varying float vWZ;
            void main(){
                vUv = uv;
                // Normalised log depth: 0 = nearest point, 1 = farthest. Log spacing keeps
                // detail where it matters (faces) and still orders far hills correctly.
                float t = 1.0 - texture2D(uDepth, uv).r;
                vL = t;
                float rel = t - uFocusT;                       // + behind the subject, - in front
                float open = smoothstep(0.5, 1.0, uDepthAmt);
                // Depth fits a fixed range (in photo heights), so every photo reads as 3D
                // without flying across the room. A little perspective spread when opened.
                vec3 real = vec3(position.xy * (1.0 + rel * 0.15 * open), -rel * uDepthRange);
                vec3 p = mix(position, real, uDepthAmt);
                p.z += uDissolve * uDissolve * 0.8;
                p.xy += (uv - 0.5) * uDissolve * 0.6;
                vec4 w = modelMatrix * vec4(p, 1.0);
                vWZ = w.z;
                gl_Position = projectionMatrix * viewMatrix * w;
            }`,
        fragmentShader: /* glsl */`
            uniform sampler2D uMap; uniform float uHover; uniform float uDissolve; uniform float uOpacity;
            uniform float uTime; uniform float uWarn; uniform vec3 uGlow; uniform vec3 uFog;
            uniform float uDepthAmt;
            varying vec2 vUv; varying float vL; varying float vWZ;
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
            float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
                return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
            void main(){
                // Tear open only along real outlines: a triangle stretched across a depth jump
                // changes depth very fast per unit of photo (uv); a face's curve changes slowly.
                vec2 gl = vec2(dFdx(vL), dFdy(vL));
                float duv = length(vec2(dFdx(vUv.x), dFdy(vUv.x))) + length(vec2(dFdx(vUv.y), dFdy(vUv.y)));
                float slope = length(gl) / max(duv, 1e-6);
                float tear = smoothstep(3.0, 7.0, slope) * smoothstep(0.35, 0.7, uDepthAmt);
                if (tear > 0.97) discard;

                vec3 c = texture2D(uMap, vUv).rgb;
                float n = noise(vUv*18.0)*0.7 + noise(vUv*60.0)*0.3;
                float cut = uDissolve * 1.15 - 0.05;
                if (n < cut) discard;
                float burn = smoothstep(0.08, 0.0, n - cut) * step(0.001, uDissolve);


                // Frosted white frame, fading out as the photo opens into full 3D.
                float e = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
                float frameOn = 1.0 - smoothstep(0.45, 0.85, uDepthAmt);
                float frame = smoothstep(0.022, 0.016, e) * frameOn;
                float hair = smoothstep(0.004, 0.0, e) * frameOn;
                vec3 tint = mix(uGlow, vec3(0.84,0.42,0.53), uWarn);

                vec3 col = c;
                float sweep = smoothstep(0.08, 0.0, abs(fract((vUv.x + vUv.y) * 0.5 - uTime * 0.25) - 0.5));
                col = mix(col, vec3(1.0), sweep * uHover * 0.18);
                col = mix(col, mix(vec3(1.0), tint, 0.35 + uHover * 0.45 + uWarn * 0.5), frame);
                col = mix(col, vec3(0.33,0.38,0.49), hair * 0.5);
                // Atmospheric haze: far parts of a photo and far photos melt into the pale sky.
                float haze = smoothstep(-1.2, -6.5, vWZ) * 0.75 + smoothstep(0.6, 1.0, vL) * 0.25 * uDepthAmt;
                col = mix(col, uFog, clamp(haze, 0.0, 0.85));
                col = mix(col, vec3(0.95,0.55,0.62), burn);
                // Soft edges in full 3D so the photo melts into the room instead of ending in a hard line.
                float edgeFade = mix(1.0, smoothstep(0.0, 0.05, e), smoothstep(0.5, 1.0, uDepthAmt));
                gl_FragColor = vec4(col, uOpacity * edgeFade * (1.0 - tear));
            }`,
    });
}
