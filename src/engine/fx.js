import * as THREE from 'three';

// A pool of glowing sparks for bursts (deleting a photo, landing in a ring, drawing).
export class Sparks {
    constructor(scene, max = 1500) {
        this.max = max;
        this.next = 0;
        this.pos = new Float32Array(max * 3);
        this.vel = new Float32Array(max * 3);
        this.col = new Float32Array(max * 3);
        this.life = new Float32Array(max);
        this.size = new Float32Array(max);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
        g.setAttribute('life', new THREE.BufferAttribute(this.life, 1));
        g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
        this.points = new THREE.Points(g, new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexShader: /* glsl */`
                attribute float life; attribute float size; attribute vec3 color; varying vec3 vC; varying float vL;
                void main(){ vC = color; vL = life; vec4 mv = modelViewMatrix*vec4(position,1.0);
                    gl_Position = projectionMatrix*mv; gl_PointSize = size * life * (3.0 / -mv.z); }`,
            fragmentShader: /* glsl */`
                varying vec3 vC; varying float vL;
                void main(){ if (vL <= 0.0) discard; float d = length(gl_PointCoord-0.5);
                    float a = smoothstep(0.5,0.0,d); gl_FragColor = vec4(vC*a*vL, a*vL); }`,
        }));
        this.points.frustumCulled = false;
        this.points.renderOrder = 5;
        scene.add(this.points);
    }

    emit(p, { count = 60, speed = 1.2, color = new THREE.Color(1, 1, 1), spread = 0.05, size = 14, up = 0 } = {}) {
        for (let n = 0; n < count; n++) {
            const i = this.next;
            this.next = (this.next + 1) % this.max;
            const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            const s = speed * (0.3 + Math.random() * 0.7);
            this.pos[i * 3] = p.x + (Math.random() - 0.5) * spread;
            this.pos[i * 3 + 1] = p.y + (Math.random() - 0.5) * spread;
            this.pos[i * 3 + 2] = p.z + (Math.random() - 0.5) * spread;
            this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
            this.vel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * s + up;
            this.vel[i * 3 + 2] = Math.cos(ph) * s;
            const c = Array.isArray(color) ? color[n % color.length] : color;
            this.col[i * 3] = c.r * 2; this.col[i * 3 + 1] = c.g * 2; this.col[i * 3 + 2] = c.b * 2;
            this.life[i] = 1;
            this.size[i] = size * (0.5 + Math.random());
        }
    }

    update(dt) {
        const drag = Math.exp(-2.2 * dt);
        for (let i = 0; i < this.max; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= dt * 0.9;
            this.vel[i * 3] *= drag; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - dt * 0.25; this.vel[i * 3 + 2] *= drag;
            this.pos[i * 3] += this.vel[i * 3] * dt;
            this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
            this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
        }
        const a = this.points.geometry.attributes;
        a.position.needsUpdate = a.life.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
    }

    dispose() {
        this.points.parent?.remove(this.points);
        this.points.geometry.dispose();
        this.points.material.dispose();
    }
}
