import * as THREE from 'three';
import { THEME } from '../engine/theme';

// A photo rebuilt as real 3D, drawn on one flat card by tracing each pixel's line of sight
// through the depth map (the same idea as DepthFlow's parallax shader), so nothing ever
// tears or stretches into stripes.
//
// When scripts/photo_layers.py has run, a photo has two layers, like Apple's spatial scenes:
//   front: the subject, cut out with a soft edge by Apple Vision (depth png R, mask in B)
//   back:  the scene with the subject painted out by LaMa (bg jpg, its depth in G)
// so leaning around a person shows the wall behind them instead of a hole.
// Photos without layers trace the single depth map.
export const PHOTO_GEO = new THREE.PlaneGeometry(1, 1, 1, 1);
export const PHOTO_GEO_LO = PHOTO_GEO;

export function makePhotoMaterial({ map, bg, depth, depthLo, meta, glow, layers = false }) {
    // Where the subject sits in the 0..1 log-depth range (matches the encoding in prepare_photos.py).
    const focusT = meta ? Math.log(meta.focus / meta.near) / Math.log(meta.far / meta.near) : 0.4;
    return new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
            uMap: { value: map },
            uBg: { value: bg || map },
            uDepth: { value: depth },
            uDepthLo: { value: depthLo },   // low bytes of 16-bit depth (photo_layers.py); null = 8-bit only
            uHasLo: { value: depthLo ? 1 : 0 },
            uLayers: { value: layers ? 1 : 0 },
            uFocusT: { value: focusT },
            uDepthRange: { value: 0.9 },
            uDepthAmt: { value: 0.35 },
            uSteps: { value: 32 },          // more for the opened photo, fewer for thumbnails
            uHover: { value: 0 },
            uDissolve: { value: 0 },
            uOpacity: { value: 1 },
            uTime: { value: 0 },
            uWarn: { value: 0 },
            uGlow: { value: new THREE.Color(glow) },
            uFog: { value: new THREE.Color(THEME.bg) },
        },
        vertexShader: /* glsl */`
            uniform float uDissolve;
            varying vec2 vUv; varying vec3 vLocal; varying vec3 vCam; varying float vWZ;
            void main(){
                vUv = uv;
                vLocal = position;
                // The eye in the card's own space, where x,y = photo position and z = depth.
                vCam = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
                vec3 p = position;
                p.z += uDissolve * uDissolve * 0.8;
                p.xy += (uv - 0.5) * uDissolve * 0.6;
                vec4 w = modelMatrix * vec4(p, 1.0);
                vWZ = w.z;
                gl_Position = projectionMatrix * viewMatrix * w;
            }`,
        fragmentShader: /* glsl */`
            uniform sampler2D uMap; uniform sampler2D uBg; uniform sampler2D uDepth; uniform sampler2D uDepthLo; uniform float uHasLo;
            uniform float uLayers; uniform float uSteps; uniform float uFocusT; uniform float uDepthRange; uniform float uDepthAmt;
            uniform float uHover; uniform float uDissolve; uniform float uOpacity;
            uniform float uTime; uniform float uWarn; uniform vec3 uGlow; uniform vec3 uFog;
            varying vec2 vUv; varying vec3 vLocal; varying vec3 vCam; varying float vWZ;
            float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
            float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
                return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }

            // Depth samples are white = near, log spaced. Height is how far a pixel stands
            // out of the card: + toward you (in front of the subject's distance), - behind.
            float height(float d){ return -((1.0 - d) - uFocusT) * uDepthRange * uDepthAmt; }
            // High and low bytes filter linearly on their own, so adding them back gives smooth 16-bit depth.
            vec4 D(vec2 uv){
                uv = clamp(uv, 0.0, 1.0);
                vec4 d = texture2D(uDepth, uv);
                if (uHasLo > 0.5) d.rg = d.rg * (65280.0 / 65535.0) + texture2D(uDepthLo, uv).rg * (255.0 / 65535.0);
                return d;
            }
            float backH(vec4 d){ return height(uLayers > 0.5 ? d.g : d.r); }
            // The front depth is one smooth surface everywhere (photo_layers.py carries the subject's
            // depth past its edge); the cut-out mask only decides how see-through each spot is.
            // Testing the mask here instead would make rays near the outline hit-or-miss (dotty ghosts).
            bool hitFront(vec3 q){ return uLayers > 0.5 && q.z <= height(D(q.xy + 0.5).r); }
            bool hitBack(vec3 q){ return q.z <= backH(D(q.xy + 0.5)); }

            void main(){
                vec3 ro = vCam, rd = normalize(vLocal - vCam);
                vec2 uvF = vUv, uvB = vUv;
                float alpha = 0.0, tB = 1.0 - D(vUv).r;
                if (uDepthAmt > 0.002 && abs(rd.z) > 1e-4) {
                    // March the ray from the nearest possible depth to the farthest.
                    float zFront = uFocusT * uDepthRange * uDepthAmt;
                    float zBack = -(1.0 - uFocusT) * uDepthRange * uDepthAmt;
                    float s0 = (zFront - ro.z) / rd.z, s1 = (zBack - ro.z) / rd.z;
                    const int MAX_STEPS = 160;
                    float ds = (s1 - s0) / uSteps;
                    float sF = -1.0, sB = s1;
                    for (int i = 1; i <= MAX_STEPS; i++) {
                        if (float(i) > uSteps) break;
                        float s = s0 + ds * float(i);
                        vec3 q = ro + rd * s;
                        if (sF < 0.0 && hitFront(q)) {
                            // Refine where the ray first touches the subject.
                            float a = s - ds, b = s;
                            for (int k = 0; k < 7; k++) { float m = 0.5 * (a + b); if (hitFront(ro + rd * m)) b = m; else a = m; }
                            sF = b;
                        }
                        if (hitBack(q)) {
                            float a = s - ds, b = s;
                            for (int k = 0; k < 7; k++) { float m = 0.5 * (a + b); if (hitBack(ro + rd * m)) b = m; else a = m; }
                            sB = b;
                            break;
                        }
                    }
                    uvB = (ro + rd * sB).xy + 0.5;
                    tB = 1.0 - (uLayers > 0.5 ? D(uvB).g : D(uvB).r);
                    if (sF >= 0.0 && sF <= sB) {
                        uvF = (ro + rd * sF).xy + 0.5;
                        alpha = smoothstep(0.04, 0.6, D(uvF).b);
                    }
                }
                vec3 c = mix(texture2D(uBg, clamp(uvB, 0.0, 1.0)).rgb, texture2D(uMap, clamp(uvF, 0.0, 1.0)).rgb, alpha);
                float tL = mix(tB, 1.0 - D(uvF).r, alpha);

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
                float haze = smoothstep(-1.2, -6.5, vWZ) * 0.75 + smoothstep(0.6, 1.0, tL) * 0.25 * uDepthAmt;
                col = mix(col, uFog, clamp(haze, 0.0, 0.85));
                col = mix(col, vec3(0.95,0.55,0.62), burn);
                // Soft edges in full 3D so the photo melts into the room instead of ending in a hard line.
                // The traced background can run past the photo's edge; fade it there too.
                float eB = min(min(uvB.x, 1.0-uvB.x), min(uvB.y, 1.0-uvB.y));
                float eT = mix(eB, max(eB, e), alpha);
                float edgeFade = mix(1.0, smoothstep(0.0, 0.05, min(e, eT + 0.02)), smoothstep(0.5, 1.0, uDepthAmt));
                gl_FragColor = vec4(col, uOpacity * edgeFade);
            }`,
    });
}
