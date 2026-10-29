import * as THREE from 'three';
import { THEME } from './theme';

const BONES = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

// Your hands drawn as glowing light skeletons floating just in front of the glass.
// Every joint sits on the ray from your eye through its spot on the screen, so the
// hand always lines up with the cursor, and still shifts in depth as you move your head.
export class HandViz {
    constructor(stage) {
        this.stage = stage;
        this.group = new THREE.Group();
        this.visible = true;
        this.hands = [0, 1].map(() => {
            const lg = new THREE.BufferGeometry();
            lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BONES.length * 6), 3));
            const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({
                color: new THREE.Color(THEME.sky), transparent: true, opacity: 0.8,
                depthWrite: false, depthTest: false,
            }));
            const pg = new THREE.BufferGeometry();
            pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(21 * 3), 3));
            const glow = new Float32Array(21);
            pg.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
            const points = new THREE.Points(pg, new THREE.ShaderMaterial({
                transparent: true, depthWrite: false, depthTest: false,
                uniforms: { uColor: { value: new THREE.Color(THEME.sky) }, uHot: { value: new THREE.Color(THEME.rose) } },
                vertexShader: /* glsl */`
                    attribute float glow; varying float vG;
                    void main(){ vG = glow; vec4 mv = modelViewMatrix*vec4(position,1.0);
                        gl_Position = projectionMatrix*mv; gl_PointSize = (11.0 + glow*12.0) * (3.0 / -mv.z); }`,
                fragmentShader: /* glsl */`
                    uniform vec3 uColor; uniform vec3 uHot; varying float vG;
                    void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5,0.3,d);
                        // pearl: white centre, tinted rim
                        vec3 c = mix(vec3(1.0), mix(uColor,uHot,vG), smoothstep(0.05,0.45,d));
                        gl_FragColor = vec4(c, a * 0.95); }`,
            }));
            lines.renderOrder = points.renderOrder = 10;
            lines.frustumCulled = points.frustumCulled = false;
            this.group.add(lines, points);
            return { lines, points, glow, fade: 0 };
        });
        this._v = new THREE.Vector3();
    }

    update(frame, dt) {
        const st = this.stage;
        frame.hands.forEach((h, i) => {
            const viz = this.hands[i];
            viz.fade += ((h.present && this.visible ? 1 : 0) - viz.fade) * Math.min(1, dt * 8);
            viz.lines.visible = viz.points.visible = viz.fade > 0.01;
            if (!viz.lines.visible) return;
            viz.lines.material.opacity = 0.7 * viz.fade;

            const lm = h.landmarks;
            const pts = viz.points.geometry.attributes.position.array;
            // Push the hand forward/back with depth; each joint keeps its own relative depth.
            const baseZ = 0.35 + h.z * 0.25;
            for (let j = 0; j < 21; j++) {
                const z = baseZ - lm[j * 3 + 2] * 0.12;
                st.pointAtZ(lm[j * 3], lm[j * 3 + 1], z, this._v);
                pts[j * 3] = this._v.x; pts[j * 3 + 1] = this._v.y; pts[j * 3 + 2] = this._v.z;
                const tip = j === 4 || j === 8;
                viz.glow[j] = h.fist ? 0.6 : tip ? h.pinchStrength : 0;
            }
            viz.points.geometry.attributes.position.needsUpdate = true;
            viz.points.geometry.attributes.glow.needsUpdate = true;

            const lp = viz.lines.geometry.attributes.position.array;
            BONES.forEach(([a, b], k) => {
                lp.set(pts.subarray(a * 3, a * 3 + 3), k * 6);
                lp.set(pts.subarray(b * 3, b * 3 + 3), k * 6 + 3);
            });
            viz.lines.geometry.attributes.position.needsUpdate = true;
            const c = viz.lines.material.color;
            c.set(h.fist ? THEME.peach : h.pinch ? THEME.rose : THEME.sky);
        });
    }
}
