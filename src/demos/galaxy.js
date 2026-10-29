import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { ui, toast, coachDone } from '../engine/store';
import { audio } from '../engine/audio';
import { damp, clamp } from '../engine/filters';
import { Sparks } from '../engine/fx';
import { PHOTO_GEO, PHOTO_GEO_LO, makePhotoMaterial } from './photoMaterial';

import { PALETTE, THEME } from '../engine/theme';
const BASE_H = 0.42;
const CENTER = new THREE.Vector3(0, 0, -1.9);
const TAP_TIME = 0.28;
const DELETE_HOLD = 1.0;

async function loadManifest() {
    for (const set of ['local', 'demo']) {
        try {
            const r = await fetch(`/${set}/manifest.json`);
            const j = JSON.parse(await r.text());
            return { set, ...j };
        } catch { /* try the next set */ }
    }
    throw new Error('No photo manifest found. Run scripts/prepare_photos.py');
}

export class GalaxyDemo {
    constructor(stage) {
        this.stage = stage;
        this.group = new THREE.Group();
        stage.scene.add(this.group);
        this.cards = [];
        this.rings = [];
        this.yaw = 0;
        this.yawVel = 0;
        this.zoom = 0;
        this.focus = null;
        this.grabs = [null, null];   // per hand: { card, t0, z0, ... }
        this.drag = [null, null];    // per hand: empty-space pinch
        this.hover = [null, null];
        this.fistLock = [false, false];
        this.deleted = [];
        this.sparks = new Sparks(stage.scene);
        this.raycaster = new THREE.Raycaster();
        this._ray = new THREE.Ray();
        this._v = new THREE.Vector3();
        this._v2 = new THREE.Vector3();
        this.unsub = ui.subscribe((s) => {
            if (s.galaxyMode !== this.mode) this.setMode(s.galaxyMode);
        });
        this.onKey = (e) => {
            if (e.key === 'Escape' && this.focus) this.unfocus();
            if (e.key === 'u') this.restore();
            if (e.key === 'g') ui.set({ galaxyMode: this.mode === 'sort' ? 'galaxy' : 'sort' });
        };
        window.addEventListener('keydown', this.onKey);
    }

    async init() {
        const m = await loadManifest();
        this.categories = m.categories;
        const loader = new THREE.TextureLoader();
        const load = (url, srgb) => new Promise((res) => loader.load(url, (tx) => {
            if (srgb) tx.colorSpace = THREE.SRGBColorSpace;
            tx.anisotropy = 4;
            res(tx);
        }, undefined, () => res(null)));

        await Promise.all(m.photos.map(async (p, i) => {
            const [map, depth] = await Promise.all([load(p.src, true), load(p.depth, false)]);
            if (!map) return;
            const glow = PALETTE[m.categories.indexOf(p.category) % PALETTE.length];
            const mat = makePhotoMaterial({ map, depth, meta: p.depthMeta, glow });
            const mesh = new THREE.Mesh(PHOTO_GEO_LO, mat);
            const mats = [mat];
            const g = new THREE.Vector3(...p.galaxy);
            const card = {
                i, data: p, mesh, mat, mats, category: p.category, aiCategory: p.category,
                pos: new THREE.Vector3(g.x * 3, g.y * 2, -8 - Math.random() * 3), // fly in from the back
                vel: new THREE.Vector3(),
                home: new THREE.Vector3(),
                galaxyHome: new THREE.Vector3(g.x * this.stage.W * 0.34, g.y * 0.68, CENTER.z + g.z * 1.2),
                custom: null,
                state: 'free', scale: 1, userScale: 1, roll: 0, tilt: new THREE.Vector2(),
                hover: 0, warn: 0, dim: 1, depthAmt: 0.3, dissolve: 0,
                spin: Math.random() * Math.PI * 2,
            };
            mesh.userData.card = card;
            mesh.renderOrder = 1;
            this.group.add(mesh);
            this.cards[i] = card;
        }));
        this.cards = this.cards.filter(Boolean);

        // Little floating label that names what the AI thinks a photo is.
        const el = document.createElement('div');
        el.className = 'ai-tag';
        this.tag = new CSS2DObject(el);
        this.tag.visible = false;
        this.stage.scene.add(this.tag);

        this.buildRings();
        ui.set({ photoSet: m.set, categories: m.categories });
        this.updateCounts();
        this.setMode(ui.get().galaxyMode);
        audio.chime(null, 392);
        this.ready = true;
    }

    resize() {
        for (const c of this.cards) {
            const g = c.data.galaxy;
            c.galaxyHome.set(g[0] * this.stage.W * 0.34, g[1] * 0.68, CENTER.z + g[2] * 1.2);
        }
        this.buildRings();
    }

    buildRings() {
        for (const r of this.rings) { this.stage.scene.remove(r.mesh, r.label); r.label.element.remove(); }
        this.rings = [];
        const n = this.categories.length;
        const span = Math.min(this.stage.W * 0.82, n * 1.3);
        // Rings shrink on narrow windows so they never overlap.
        const rad = Math.min(0.42, n > 1 ? (span / (n - 1)) * 0.4 : 0.42);
        this.categories.forEach((name, i) => {
            const color = new THREE.Color(PALETTE[i % PALETTE.length]);
            const pos = new THREE.Vector3(n === 1 ? 0 : -span / 2 + (i / (n - 1)) * span, 0.05, -2.1);
            const mesh = new THREE.Mesh(
                new THREE.TorusGeometry(rad, 0.024, 12, 120),
                new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0, depthWrite: false, depthTest: false }),
            );
            mesh.position.copy(pos);
            mesh.renderOrder = 2; // drawn over the orbiting photos like a halo
            const el = document.createElement('div');
            el.className = 'ring-label';
            el.style.setProperty('--c', PALETTE[i % PALETTE.length]);
            const label = new CSS2DObject(el);
            label.position.copy(pos).add(new THREE.Vector3(0, -rad - 0.2, 0));
            this.stage.scene.add(mesh, label);
            this.rings.push({ name, pos, mesh, label, color, rad, pulse: 0 });
        });
        this.updateCounts();
    }

    updateCounts() {
        const counts = {};
        for (const c of this.cards) if (c.state !== 'dead') counts[c.category] = (counts[c.category] || 0) + 1;
        ui.set({ counts });
        for (const r of this.rings) r.label.element.innerHTML = `<b>${r.name}</b><span>${counts[r.name] || 0}</span>`;
    }

    setMode(mode) {
        this.mode = mode;
        if (this.focus) this.unfocus(true);
        for (const c of this.cards) if (c.state === 'free') c.vel.add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5, 0));
        this.stage.setRoomTint(mode === 'sort' ? THEME.lilac : THEME.sky, 1);
        audio.whoosh(null, 1.5);
    }

    // Where a card wants to be right now.
    computeHome(c, t) {
        if (this.mode === 'sort') {
            const ring = this.rings.find((r) => r.name === c.category) || this.rings[0];
            const members = this.cards.filter((k) => k.category === c.category && k.state !== 'dead');
            const j = members.indexOf(c), n = Math.max(1, members.length);
            const a = t * 0.25 + (j / n) * Math.PI * 2;
            const r = ring.rad + (n > 8 ? (j % 2) * 0.16 : 0);
            c.home.set(ring.pos.x + Math.cos(a) * r, ring.pos.y + Math.sin(a) * r * 0.9, ring.pos.z + Math.sin(a * 2) * 0.05);
            c.scale = 0.55 * Math.min(1, ring.rad / 0.42 + 0.15);
            return;
        }
        const base = c.custom || c.galaxyHome;
        const yaw = c.custom ? 0 : this.yaw + t * 0.04;
        this._v.copy(base).sub(CENTER);
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        const x = this._v.x * cs + this._v.z * sn, z = -this._v.x * sn + this._v.z * cs;
        c.home.set(x, this._v.y + Math.sin(t * 0.5 + c.spin) * 0.03, z).add(CENTER);
        c.home.z += this.zoom;
        c.scale = 1;
    }

    pick(h) {
        this.stage.ray(h.x, h.y, this._ray);
        this.raycaster.ray.copy(this._ray);
        const meshes = this.cards.filter((c) => c.state !== 'dead' && (!this.focus || c === this.focus)).map((c) => c.mesh);
        const hit = this.raycaster.intersectObjects(meshes, false)[0];
        return hit ? { card: hit.object.userData.card, dist: hit.distance, point: hit.point } : null;
    }

    update(dt, t, frame) {
        if (!this.ready) return;
        const st = this.stage;
        if (frame.hands.some((h) => h.present)) coachDone('hand');
        if (Math.hypot(st.eye.x, st.eye.y) > 0.35 && st.tracker.mode === 'camera') coachDone('head');

        // ---- hands ----
        frame.hands.forEach((h, i) => this.updateHand(h, i, frame, t, dt));
        this.twoHand(frame);

        // ---- galaxy spin ----
        this.yaw += this.yawVel * dt;
        this.yawVel *= Math.exp(-2.5 * dt);

        // ---- cards ----
        const k = damp(14, dt);
        for (const c of this.cards) {
            if (c.state === 'dead') {
                c.dissolve = Math.min(1, c.dissolve + dt * 1.1);
                for (const m of c.mats) m.uniforms.uDissolve.value = c.dissolve;
                c.mesh.visible = c.dissolve < 1;
                continue;
            }
            this.computeHome(c, t);
            let targetScale = c.scale * c.userScale;
            // How far a photo opens into true 3D: a little in the galaxy, more on hover, fully when opened.
            let targetDepth = 0.3 + c.hover * 0.2;
            // An open photo gets the room to itself.
            let dim = this.focus && this.focus !== c ? 0 : 1;

            if (c.state === 'focus') {
                const maxH = Math.min(0.95, (st.W * 0.45) / c.data.aspect);
                c.home.set(0, 0, 0.45);
                targetScale = (maxH / BASE_H) * c.userScale;
                targetDepth = 1;
                c.pos.lerp(c.home, damp(7, dt));
                c.vel.set(0, 0, 0);
            } else if (c.state === 'held') {
                // position set in updateHand
            } else if (c.state === 'thrown') {
                c.pos.addScaledVector(c.vel, dt);
                c.vel.multiplyScalar(Math.exp(-1.4 * dt));
                c.vel.addScaledVector(this._v.copy(c.home).sub(c.pos), dt * 2.5);
                if (this.mode === 'sort') this.checkRing(c, true);
                if (c.vel.length() < 0.6 || t - c.thrownT > 2.2) c.state = 'free';
            } else {
                // Spring home (semi-implicit Euler, nearly critically damped).
                c.vel.addScaledVector(this._v.copy(c.home).sub(c.pos), 26 * dt);
                c.vel.multiplyScalar(Math.exp(-8 * dt));
                c.pos.addScaledVector(c.vel, dt);
                this.sweep(c, frame, dt);
            }

            c.dim += (dim - c.dim) * k;
            c.mesh.visible = c.dim > 0.02;
            c.depthAmt += (targetDepth - c.depthAmt) * damp(5, dt);
            const s = THREE.MathUtils.lerp(c.mesh.scale.y / BASE_H || targetScale, targetScale, k);
            c.mesh.scale.set(BASE_H * c.data.aspect * s, BASE_H * s, BASE_H * s);
            c.mesh.position.copy(c.pos);
            if (c.hover > 0.01 && c.state === 'free') c.mesh.position.z += c.hover * 0.12;
            if (c.warn > 0) c.mesh.position.x += Math.sin(t * 70) * 0.008 * c.warn;

            // Turn partly toward your eye, so photos feel placed in a room, not glued to the glass.
            this._v.copy(st.eye).sub(c.mesh.position);
            const yawTo = Math.atan2(this._v.x, this._v.z) * 0.35;
            const pitchTo = -Math.atan2(this._v.y, Math.hypot(this._v.x, this._v.z)) * 0.25;
            c.mesh.rotation.set(pitchTo + c.tilt.y, yawTo + c.tilt.x, c.roll, 'YXZ');

            for (const m of c.mats) {
                const u = m.uniforms;
                u.uTime.value = t;
                u.uHover.value = c.state === 'focus' ? 0 : c.hover;
                u.uWarn.value = c.warn;
                u.uOpacity.value = c.dim;
                u.uDepthAmt.value = c.depthAmt;
            }
            c.mesh.renderOrder = c.state === 'focus' || c.state === 'held' ? 3 : 1;
            c.mesh.geometry = c.state === 'focus' ? PHOTO_GEO : PHOTO_GEO_LO;
        }

        // ---- rings ----
        const ringOn = this.mode === 'sort' ? 1 : 0;
        for (const r of this.rings) {
            r.pulse = Math.max(0, r.pulse - dt * 1.5);
            const m = r.mesh.material;
            m.opacity += (ringOn * (0.75 + r.pulse * 0.25) - m.opacity) * k;
            r.mesh.scale.setScalar(1 + r.pulse * 0.25 + Math.sin(t * 2 + r.pos.x) * 0.015);
            r.mesh.rotation.z = t * 0.2;
            r.label.visible = m.opacity > 0.05;
            r.label.element.style.opacity = m.opacity * 1.6;
        }

        this.sparks.update(dt);
        this.updateTag(frame);
    }

    updateHand(h, i, frame, t, dt) {
        const st = this.stage;
        const grab = this.grabs[i];
        st.cursorProgress[i] = 0;
        st.cursorTint[i] = null;

        if (!h.present || h.captured) {
            if (grab) this.release(i, h, t);
            this.setHover(i, null);
            return;
        }

        // Hover
        const hit = grab ? null : this.pick(h);
        this.setHover(i, hit?.card || null);
        const hov = this.hover[i];
        if (hov) st.cursorTint[i] = hov.mat.uniforms.uGlow.value.getStyle();

        // Fist over a photo: hold to delete.
        // One fist burns one photo; open your hand before burning the next.
        if (!h.fist) this.fistLock[i] = false;
        if (h.fist && hov && !this.focus && !this.fistLock[i]) {
            const p = clamp(h.fistTime / DELETE_HOLD, 0, 1);
            st.cursorProgress[i] = p;
            hov.warn = p;
            if (p >= 1) { this.kill(hov); this.fistLock[i] = true; }
            return;
        }
        for (const c of this.cards) if (c.warn && !frame.hands.some((x) => x.fist)) c.warn = Math.max(0, c.warn - dt * 4);

        // Push toward the screen: open a photo (or close it).
        if (h.pushed) {
            if (this.focus) this.unfocus();
            else if (hov) this.doFocus(hov);
        }

        if (h.justPinched) {
            if (this.focus) {
                this.drag[i] = { x: h.x, y: h.y, t, tilt: this.focus.tilt.clone() };
            } else if (hov && !this.grabs.some((g) => g?.card === hov)) {
                const c = hov;
                this.grabs[i] = {
                    card: c, t0: hit.dist, z0: h.z, t, x0: h.x, y0: h.y,
                    offset: c.pos.clone().sub(hit.point), moved: 0,
                    last: c.pos.clone(), vel: new THREE.Vector3(),
                };
                c.state = 'held';
                coachDone('grab');
                audio.grab(c.pos);
            } else {
                this.drag[i] = { x: h.x, y: h.y, t };
            }
        }

        if (this.grabs[i] && h.pinch) {
            const g = this.grabs[i], c = g.card;
            // Pull your hand back to bring the photo closer, push forward to send it deeper.
            const dist = clamp(g.t0 + (h.z - g.z0) * 2.4, 0.8, 9);
            st.ray(h.x, h.y, this._ray);
            this._ray.at(dist, this._v).add(g.offset);
            c.pos.lerp(this._v, damp(22, dt));
            g.moved = Math.max(g.moved, Math.hypot(h.x - g.x0, h.y - g.y0));
            g.vel.lerp(this._v2.copy(c.pos).sub(g.last).divideScalar(Math.max(dt, 1e-3)), 0.35);
            g.last.copy(c.pos);
            if (this.mode === 'sort') this.checkRing(c, false);
        }

        if (this.drag[i] && h.pinch && !this.grabs[i]) {
            const d = this.drag[i];
            if (this.focus) {
                // Turn the open photo to look around its 3D shape.
                this.focus.tilt.set(
                    clamp(d.tilt.x + (h.x - d.x) * 2.5, -0.7, 0.7),
                    clamp(d.tilt.y + (h.y - d.y) * 2.0, -0.5, 0.5));
            } else if (!frame.hands.every((x) => x.pinch && !x.captured)) {
                this.yawVel += -h.vx * dt * 6;
            }
        }

        if (h.justReleased) {
            if (this.grabs[i]) this.release(i, h, t);
            else if (this.drag[i]) {
                const d = this.drag[i];
                const tap = t - d.t < TAP_TIME && Math.hypot(h.x - d.x, h.y - d.y) < 0.02;
                if (tap && this.focus) this.unfocus();
                this.drag[i] = null;
            }
        }
    }

    twoHand(frame) {
        const [a, b] = frame.hands;
        const both = a.present && b.present && a.pinch && b.pinch && !a.captured && !b.captured;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (!both) { this.two = null; return; }
        const held = this.grabs[0]?.card || this.grabs[1]?.card || this.focus;
        if (!this.two) {
            this.two = { dist, ang, mid: (a.x + b.x) / 2, card: held, scale: held?.userScale ?? 1, roll: held?.roll ?? 0, zoom: this.zoom, yaw: this.yaw };
            return;
        }
        const tw = this.two;
        if (tw.card) {
            // Stretch and twist the photo with two hands.
            tw.card.userScale = clamp(tw.scale * (dist / tw.dist), 0.4, 3.2);
            tw.card.roll = tw.roll - (ang - tw.ang);
        } else {
            // Two hands on empty space: pull apart to fly in, slide to spin.
            this.zoom = clamp(tw.zoom + (dist - tw.dist) * 3, -2, 2.4);
            this.yaw = tw.yaw + (((a.x + b.x) / 2) - tw.mid) * 3;
        }
    }

    setHover(i, card) {
        const prev = this.hover[i];
        if (prev === card) {
            if (card) card.hover = Math.min(1, card.hover + 0.15);
            return;
        }
        this.hover[i] = card;
        if (prev && !this.hover.includes(prev)) prev.hover = 0;
        if (card) {
            card.hover = 0.3;
            audio.hover(card.pos, 1 + (card.pos.z + 2) * 0.1);
            ui.set({ hovered: { id: card.data.id, category: card.category, ai: card.aiCategory, confidence: card.data.confidence } });
        } else if (!this.hover.some(Boolean)) ui.set({ hovered: null });
    }

    release(i, h, t) {
        const g = this.grabs[i];
        this.grabs[i] = null;
        if (!g) return;
        const c = g.card;
        const tap = t - g.t < TAP_TIME && g.moved < 0.025;
        if (tap) { c.state = 'free'; this.doFocus(c); return; }

        const speed = g.vel.length();
        if (speed > 2.2) {
            c.state = 'thrown';
            c.thrownT = t;
            c.vel.copy(g.vel).clampLength(0, 9);
            audio.whoosh(c.pos, speed / 4);
            return;
        }
        c.state = 'free';
        c.vel.set(0, 0, 0);
        audio.release(c.pos);
        if (this.mode === 'sort') {
            if (!this.checkRing(c, true)) c.vel.set(0, 0.5, 0);
        } else {
            // Drop it anywhere: the galaxy remembers where you put it.
            // Placed photos stop spinning with the rest; zoom still applies.
            c.custom = c.pos.clone();
            c.custom.z -= this.zoom;
        }
    }

    // Sort mode: is this photo inside a ring? (Compared on screen, so depth never gets in the way.)
    checkRing(c, commit) {
        const sp = this.stage.toScreen(c.pos);
        let best = null, bestD = 0.085;
        for (const r of this.rings) {
            const rp = this.stage.toScreen(r.pos);
            const d = Math.hypot((sp.x - rp.x) * this.stage.aspect, sp.y - rp.y);
            if (d < bestD) { bestD = d; best = r; }
        }
        // The ring you're over brightens into a soft glow.
        for (const r of this.rings) r.mesh.material.color.copy(r.color).multiplyScalar(r === best ? 1.6 : 1);
        if (!best || !commit) return !!best;
        const changed = best.name !== c.category;
        c.category = best.name;
        c.mat.uniforms.uGlow.value.copy(best.color);
        c.state = 'free';
        best.pulse = 1;
        this.sparks.emit(best.pos, { count: 70, speed: 1.3, color: best.color, spread: 0.3 });
        audio.chime(best.pos, 392 * (1 + this.rings.indexOf(best) * 0.125));
        coachDone('sort');
        if (changed) toast(c.aiCategory !== best.name ? `Moved to ${best.name} · you corrected the AI` : `Back to ${best.name}`);
        this.updateCounts();
        return true;
    }

    // Fast hand sweeps push photos aside, like moving through floating paper.
    sweep(c, frame, dt) {
        if (this.mode !== 'galaxy' || this.focus) return;
        for (const h of frame.hands) {
            if (!h.present || h.pinch || h.captured) continue;
            const speed = Math.hypot(h.vx, h.vy);
            if (speed < 1.1) continue;
            this.stage.pointAtZ(h.x, h.y, c.pos.z, this._v);
            const d = this._v.distanceTo(c.pos);
            if (d < 0.5) {
                this._v2.copy(c.pos).sub(this._v).setZ(0).normalize();
                c.vel.addScaledVector(this._v2, (0.5 - d) * speed * 9 * dt);
                c.vel.z -= (0.5 - d) * speed * 2 * dt;
            }
        }
    }

    doFocus(c) {
        if (this.focus === c) return;
        if (this.focus) this.unfocus(true);
        this.focus = c;
        c.state = 'focus';
        c.tilt.set(0, 0);
        c.userScale = 1;
        ui.set({ focused: c.data.id });
        coachDone('focus');
        audio.focus(new THREE.Vector3(0, 0, 0.5));
    }

    unfocus(silent) {
        const c = this.focus;
        if (!c) return;
        this.focus = null;
        c.state = 'free';
        c.tilt.set(0, 0);
        c.userScale = 1;
        c.roll = 0;
        ui.set({ focused: null });
        if (!silent) audio.release(c.pos);
    }

    kill(c) {
        if (c.state === 'dead') return;
        c.state = 'dead';
        c.warn = 0;
        this.grabs = this.grabs.map((g) => (g?.card === c ? null : g));
        this.hover = this.hover.map((x) => (x === c ? null : x));
        this.deleted.push(c);
        this.sparks.emit(c.pos, { count: 160, speed: 1.6, color: [new THREE.Color(THEME.rose), new THREE.Color(THEME.peach), new THREE.Color(THEME.lilac)], spread: 0.4, up: 0.3 });
        audio.dissolve(c.pos);
        toast('Photo burned away · press U to bring it back', 3200);
        this.updateCounts();
    }

    restore() {
        if (!this.deleted.length) return;
        for (const c of this.deleted) {
            c.state = 'free';
            c.dissolve = 0;
            for (const m of c.mats) m.uniforms.uDissolve.value = 0;
            c.mesh.visible = true;
            c.pos.set(c.pos.x, c.pos.y, -7);
        }
        toast(`Restored ${this.deleted.length} photo${this.deleted.length > 1 ? 's' : ''}`);
        this.deleted = [];
        this.updateCounts();
    }

    updateTag() {
        const c = this.focus || this.hover.find(Boolean);
        if (!c || c.state === 'dead') { this.tag.visible = false; return; }
        this.tag.visible = true;
        const h = c.mesh.scale.y;
        // Open photos get the tag on top so it never collides with the gesture legend.
        const above = c === this.focus ? 1 : -1;
        this.tag.position.copy(c.mesh.position).add(this._v.set(0, above * (h / 2 + 0.08), 0.02));
        const conf = Math.round((c.data.confidence || 0) * 100);
        const fixed = c.category !== c.aiCategory;
        const html = fixed
            ? `<i>AI said ${c.aiCategory}</i> → <b>${c.category}</b>`
            : `<i>AI</i> <b>${c.category}</b> <span>${conf}%</span>`;
        if (this.tag.element.innerHTML !== html) this.tag.element.innerHTML = html;
    }

    dispose() {
        this.unsub();
        window.removeEventListener('keydown', this.onKey);
        this.stage.scene.remove(this.group, this.tag);
        this.tag.element.remove();
        for (const r of this.rings) { this.stage.scene.remove(r.mesh, r.label); r.label.element.remove(); r.mesh.geometry.dispose(); }
        for (const c of this.cards) for (const m of c.mats) { m.uniforms.uMap.value?.dispose(); m.uniforms.uDepth.value?.dispose(); m.dispose(); }
        this.sparks.dispose();
        ui.set({ hovered: null, focused: null });
    }
}
