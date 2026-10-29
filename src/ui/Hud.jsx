import { ui, useUI } from '../engine/store';
import StatusPill from './StatusPill';

const TITLES = { galaxy: 'Photo Galaxy', draw: 'Light Sculptor', theremin: 'Air Theremin' };

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
};

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

    const steps = (COACH[demo] || []).filter(([id]) => !(id === 'head' && input !== 'camera'));
    const allDone = steps.every(([id]) => coach[id]);

    return (
        <div className="overlay hud">
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

            {!allDone && (
                <div className="coach">
                    <div className="coach-h">Try this</div>
                    {steps.map(([id, text]) => (
                        <div key={id} className={`step ${coach[id] ? 'done' : ''}`}>
                            <span className="tick">{coach[id] ? '✓' : ''}</span>{text}
                        </div>
                    ))}
                </div>
            )}

            <div className="legend">
                {(LEGEND[demo] || []).map(([g, a]) => (
                    <span key={g}><b>{g}</b>{a}</span>
                ))}
            </div>
            {input === 'mouse' && <div className="mouse-keys">{MOUSE_KEYS}</div>}
            <div className={`toast ${toastText ? 'on' : ''}`}>{toastText}</div>
        </div>
    );
}
