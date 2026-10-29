import * as THREE from 'three';
import { THEME } from '../engine/theme';

// A photo that is really a 3D surface: every vertex is pushed toward you by the
// AI depth map, so faces bulge forward and backgrounds fall back.
export const PHOTO_GEO = new THREE.PlaneGeometry(1, 1, 110, 110);

export function makePhotoMaterial(map, depth, glow) {
    return new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
            uMap: { value: map },
            uDepth: { value: depth },
            uDepthAmt: { value: 0.22 },
            uHover: { value: 0 },
            uDissolve: { value: 0 },
            uOpacity: { value: 1 },
            uTime: { value: 0 },
            uWarn: { value: 0 },
            uGlow: { value: new THREE.Color(glow) },
            uFog: { value: new THREE.Color(THEME.bg) },
        },
        vertexShader: /* glsl */`
            uniform sampler2D uDepth; uniform float uDepthAmt; uniform float uTime; uniform float uDissolve;
            varying vec2 vUv; varying float vStretch; varying float vWZ;
            void main(){
                vUv = uv;
                float d = texture2D(uDepth, uv).r;
                float e = 1.0/110.0;
                float dx = texture2D(uDepth, uv+vec2(e,0.)).r - texture2D(uDepth, uv-vec2(e,0.)).r;
                float dy = texture2D(uDepth, uv+vec2(0.,e)).r - texture2D(uDepth, uv-vec2(0.,e)).r;
                // Big depth jumps stretch triangles into "curtains"; remember where so we can hide them.
                vStretch = length(vec2(dx,dy)) * uDepthAmt * 30.0;
                float edge = smoothstep(0.0,0.05,uv.x)*smoothstep(1.0,0.95,uv.x)*smoothstep(0.0,0.05,uv.y)*smoothstep(1.0,0.95,uv.y);
                vec3 p = position;
                p.z += (d - 0.3) * uDepthAmt * mix(0.35, 1.0, edge);
                // Dissolve: the surface drifts apart as it burns away.
                p.z += uDissolve * uDissolve * (d + 0.2) * 0.8;
                p.xy += (uv - 0.5) * uDissolve * 0.6;
                vec4 w = modelMatrix * vec4(p,1.0);
                vWZ = w.z;
                gl_Position = projectionMatrix * viewMatrix * w;
            }`,
        fragmentShader: /* glsl */`
            uniform sampler2D uMap; uniform float uHover; uniform float uDissolve; uniform float uOpacity;
            uniform float uTime; uniform float uWarn; uniform vec3 uGlow; uniform vec3 uFog;
            varying vec2 vUv; varying float vStretch; varying float vWZ;
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
            float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
                return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
            void main(){
                vec3 c = texture2D(uMap, vUv).rgb;
                float n = noise(vUv*18.0)*0.7 + noise(vUv*60.0)*0.3;
                float cut = uDissolve * 1.15 - 0.05;
                if (n < cut) discard;
                float burn = smoothstep(0.08, 0.0, n - cut) * step(0.001, uDissolve);

                // A frosted white glass frame with a hairline of soft ink outside it.
                float e = min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y));
                float frame = smoothstep(0.022, 0.016, e);
                float hair = smoothstep(0.004, 0.0, e);
                vec3 tint = mix(uGlow, vec3(0.84,0.42,0.53), uWarn);

                vec3 col = c;
                col *= 1.0 - clamp(vStretch - 0.6, 0.0, 0.4);
                // Hover: a slow sheen of light slides across the photo.
                float sweep = smoothstep(0.08, 0.0, abs(fract((vUv.x + vUv.y) * 0.5 - uTime * 0.25) - 0.5));
                col = mix(col, vec3(1.0), sweep * uHover * 0.18);
                col = mix(col, mix(vec3(1.0), tint, 0.35 + uHover * 0.45 + uWarn * 0.5), frame);
                col = mix(col, vec3(0.33,0.38,0.49), hair * 0.5);
                // Atmospheric haze: far photos dissolve into the pale sky.
                col = mix(col, uFog, smoothstep(-1.2, -6.5, vWZ) * 0.75);
                col = mix(col, vec3(0.95,0.55,0.62), burn);
                gl_FragColor = vec4(col, uOpacity);
            }`,
    });
}
