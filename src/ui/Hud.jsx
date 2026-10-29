import { useEffect, useRef } from 'react';
import { ui, useUI } from '../engine/store';
import StatusPill from './StatusPill';

const TITLES = { galaxy: 'Photo Galaxy', draw: 'Light Sculptor', theremin: 'Air Theremin', splats: 'Splat Worlds' };

const LEGEND = {
    galaxy: [
        ['Pinch', 'grab a photo'],
        ['Quick pinch', 'open it in 3D'],
        ['Push', 'open / close'],
        ['Fling', 'throw it'],
        ['Fist (hold)', 'burn it'],
        ['Two hands', 'stretch, twist, zoom'],
    ],
    draw: [
        ['Pinch', 'draw'],
        ['Hand closer', 'draw deeper'],
        ['Other hand pinch', 'turn sculpture'],
        ['Push', 'undo'],
        ['Fist (hold)', 'clear'],
    ],
    theremin: [
        ['Right pinch', 'play'],
        ['Right height', 'note'],
        ['Right push', 'brighter'],
        ['Left height', 'volume'],
        ['Left fingers', 'wave shape'],
        ['Right open hand', 'vibrato'],
    ],
    splats: [
        ['Pinch + drag', 'turn it / look around'],
        ['Two hands', 'spread to zoom, twist to roll'],
        ['Push', 'fly in / step inside'],
        ['Pinch + hand closer', 'fly'],
        ['Open-hand swipe', 'next world'],
    ],
};

const MOUSE_LEGEND = {
    splats: [
        ['Drag', 'turn it / look around'],
        ['Scroll', 'fly in and out'],
        ['Space', 'step in'],
        ['Shift + drag', 'zoom and roll'],
        ['← →', 'next world'],
        ['R', 'reset view'],
        ['P', 'portal'],
    ],
};

const COACH = {
    galaxy: [
        ['hand', 'Raise a hand'],
        ['grab', 'Pinch a photo to grab it'],
        ['focus', 'Quick-pinch a photo to open it'],
        ['head', 'Lean your head to look around it'],
        ['sort', 'Switch to Sort and throw one into a ring'],
    ],
    draw: [
        ['draw', 'Pinch and move to draw'],
        ['rotate', 'Pinch with your other hand to turn it'],
    ],
    theremin: [
        ['play', 'Pinch your right hand to play'],
        ['volume', 'Raise your left hand for volume'],
    ],
    splats: [
        ['orbit', 'Pinch and drag to turn it'],
        ['zoom', 'Pinch with both hands and spread'],
        ['fly', 'Push toward the screen to fly in'],
        ['next', 'Swipe an open hand for the next world'],
    ],
};

const MOUSE_COACH = { next: 'Press → or pick a world below' };

const MOUSE_KEYS = 'Mouse: click = pinch · scroll = depth · hold F = fist · hold Shift = two hands · Space = push';

export default function Hud({ onBack }) {
    const demo = useUI((s) => s.demo);
    const input = useUI((s) => s.input);
    const mode = useUI((s) => s.galaxyMode);
    const mirror = useUI((s) => s.drawMirror);
    const snap = useUI((s) => s.thereminSnap);
    const note = useUI((s) => s.thereminNote);
    const toastText = useUI((s) => s.toast);
    const coach = useUI((s) => s.coach);
    const photoSet = useUI((s) => s.photoSet);
    const counts = useUI((s) => s.counts);
    const focused = useUI((s) => s.focused);
    const splatList = useUI((s) => s.splatList);
    const splatIndex = useUI((s) => s.splatIndex);
    const splatStatus = useUI((s) => s.splatStatus);
    const splatProgress = useUI((s) => s.splatProgress);
    const splatCount = useUI((s) => s.splatCount);
    const portal = useUI((s) => s.splatPortal);
    const legend = (input === 'mouse' && MOUSE_LEGEND[demo]) || LEGEND[demo] || [];
    const splat = splatList[splatIndex];
    const track = useRef(null);

    // Keep the chosen world in view when the carousel is wider than the window.
    useEffect(() => {
        track.current?.querySelector('.splat-pill.on')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }, [splatIndex, splatList]);

    const steps = (COACH[demo] || []).filter(([id]) => !(id === 'head' && input !== 'camera'));
    const allDone = steps.every(([id]) => coach[id]);

    return (
        <div className={`overlay hud ${demo} ${demo === 'splats' && portal ? 'portal' : ''}`}>
            <div className="hud-top">
                <button data-hand className="chip back" onClick={onBack}>← Menu</button>
                <div className="hud-title">
                    <span>{TITLES[demo]}</span>
                    {demo === 'galaxy' && (
                        <div className="seg">
                            <button data-hand className={mode === 'galaxy' ? 'on' : ''} onClick={() => ui.set({ galaxyMode: 'galaxy' })}>Galaxy</button>
                            <button data-hand className={mode === 'sort' ? 'on' : ''} onClick={() => ui.set({ galaxyMode: 'sort' })}>Sort</button>
                        </div>
                    )}
                    {demo === 'draw' && (
                        <div className="seg">
                            <button data-hand className={mirror ? 'on' : ''} onClick={() => ui.set({ drawMirror: !mirror })}>Mirror {mirror ? 'on' : 'off'}</button>
                        </div>
                    )}
                    {demo === 'splats' && (
                        <div className="seg">
                            <button data-hand className={portal ? 'on' : ''} onClick={() => ui.set({ splatPortal: !portal })}>Portal {portal ? 'on' : 'off'}</button>
                        </div>
                    )}
                    {demo === 'theremin' && (
                        <div className="seg">
                            <button data-hand className={snap ? 'on' : ''} onClick={() => ui.set({ thereminSnap: !snap })}>{snap ? 'Snap to scale' : 'Free pitch'}</button>
                        </div>
                    )}
                </div>
                <StatusPill />
            </div>

            {demo === 'theremin' && <div className={`big-note ${note ? 'on' : ''}`}>{note || '—'}</div>}

            {demo === 'galaxy' && (
                <div className="set-note">
                    {photoSet === 'local' ? 'Your photos · local only' : 'Demo photos'} ·{' '}
                    {Object.values(counts).reduce((a, b) => a + b, 0)} photos
                    {focused && ' · pinch-drag to turn it · push or tap to close'}
                </div>
            )}

            {demo === 'splats' && (
                <>
                    {splat && (
                        <div className="set-note splat-note" key={splat.id}>
                            {splat.line}
                            {splatCount > 0 && splatStatus === 'ready' && <span> · {fmtCount(splatCount)} splats</span>}
                        </div>
                    )}
                    <div className={`splat-loading ${splatStatus === 'loading' ? 'on' : ''}`} style={{ '--p': splatProgress / 100 }}>
                        <div className="pearl"><span /><span /></div>
                        <div className="splat-loading-text">
                            <i>gathering light</i>
                            <b>{splat?.name}</b>
                            <span>{splatProgress}%</span>
                        </div>
                    </div>
                    <div className="splat-carousel">
                        <button data-hand className="chip arrow" aria-label="Previous" onClick={() => step(-1, splatList, splatIndex)}>‹</button>
                        <div className="splat-track" ref={track}>
                            {splatList.map((s, i) => (
                                <button key={s.id} data-hand className={`splat-pill ${s.kind} ${i === splatIndex ? 'on' : ''}`}
                                    onClick={() => ui.set({ splatIndex: i })}>
                                    <span className="kind" />{s.name}
                                </button>
                            ))}
                        </div>
                        <button data-hand className="chip arrow" aria-label="Next" onClick={() => step(1, splatList, splatIndex)}>›</button>
                    </div>
                </>
            )}

            {!allDone && (
                <div className="coach">
                    <div className="coach-h">try this ✦</div>
                    {steps.map(([id, text]) => (
                        <div key={id} className={`step ${coach[id] ? 'done' : ''}`}>
                            <span className="tick">{coach[id] ? '✓' : ''}</span>{(input !== 'camera' && MOUSE_COACH[id]) || text}
                        </div>
                    ))}
                </div>
            )}

            <div className="legend">
                {legend.map(([g, a]) => (
                    <span key={g}><b>{g}</b>{a}</span>
                ))}
            </div>
            {input === 'mouse' && !MOUSE_LEGEND[demo] && <div className="mouse-keys">{MOUSE_KEYS}</div>}
            <div className={`toast ${toastText ? 'on' : ''}`}>{toastText}</div>
        </div>
    );
}

function step(dir, list, i) {
    if (!list.length) return;
    ui.set({ splatIndex: (i + dir + list.length) % list.length });
}

function fmtCount(n) {
    return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`;
}
