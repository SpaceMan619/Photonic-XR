import { useUI } from '../engine/store';

export default function StartScreen({ onStart }) {
    const input = useUI((s) => s.input);
    const error = useUI((s) => s.inputError);
    const loading = input === 'loading';

    return (
        <div className="overlay start">
            <div className="start-inner">
                <div className="eyebrow">✦ a spatial daydream</div>
                <h1 className="title">Photonic</h1>
                <p className="lede">
                    your screen becomes a window, and your hands reach through it.
                    <br />no headset, just a webcam and a little AI.
                </p>
                <div className="start-actions">
                    <button className="btn primary" disabled={loading} onClick={() => onStart('camera')}>
                        {loading ? <><span className="spinner" /> waking the dream…</> : 'Enable camera ↝'}
                    </button>
                    <button className="btn ghost" disabled={loading} onClick={() => onStart('mouse')}>
                        or try it with a mouse
                    </button>
                </div>
                {error && <p className="error">{error} You can still try it with the mouse.</p>}
                <p className="fine">
                    Tracking runs entirely in your browser. No video ever leaves this machine.
                </p>
            </div>
        </div>
    );
}
