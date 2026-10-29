import { useEffect, useRef } from 'react';
import { useUI } from '../engine/store';

const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];

// Press D: camera view with the raw landmarks and the numbers the gestures are built from.
export default function Debug({ engine }) {
    const on = useUI((s) => s.debug);
    const canvas = useRef(null);
    const text = useRef(null);

    useEffect(() => {
        if (!on) return;
        let raf;
        const draw = () => {
            raf = requestAnimationFrame(draw);
            const tr = engine.current?.tracker;
            const c = canvas.current;
            if (!tr || !c) return;
            const ctx = c.getContext('2d');
            ctx.save();
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.translate(c.width, 0);
            ctx.scale(-1, 1);
            if (tr.video) ctx.drawImage(tr.video, 0, 0, c.width, c.height);
            else { ctx.fillStyle = '#111'; ctx.fillRect(0, 0, c.width, c.height); }
            ctx.restore();
            for (const h of tr.hands) {
                if (!h.present) continue;
                const L = h.landmarks;
                ctx.strokeStyle = h.pinch ? '#ff6bd6' : h.fist ? '#ffa94d' : '#5ee7ff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (const [a, b] of BONES) {
                    ctx.moveTo(L[a * 3] * c.width, L[a * 3 + 1] * c.height);
                    ctx.lineTo(L[b * 3] * c.width, L[b * 3 + 1] * c.height);
                }
                ctx.stroke();
            }
            const hd = tr.head;
            ctx.fillStyle = '#7cff9b';
            ctx.beginPath();
            ctx.arc((0.5 + hd.x / 2) * c.width, (0.5 - hd.y / 2) * c.height, 5, 0, 7);
            ctx.fill();
            text.current.textContent = tr.hands.map((h) => h.present
                ? `#${h.slot} x${h.x.toFixed(2)} y${h.y.toFixed(2)} z${h.z.toFixed(2)} pinch:${h.pinch ? 1 : 0}(${h.pinchStrength.toFixed(2)}) fist:${h.fist ? 1 : 0} fingers:${h.fingers}`
                : `#${h.slot} —`).join('\n') + `\nhead x${hd.x.toFixed(2)} y${hd.y.toFixed(2)} d${hd.d.toFixed(2)} · ${tr.stats.fps} fps`;
        };
        draw();
        return () => cancelAnimationFrame(raf);
    }, [on, engine]);

    if (!on) return null;
    return (
        <div className="debug">
            <canvas ref={canvas} width={240} height={180} />
            <pre ref={text} />
        </div>
    );
}
