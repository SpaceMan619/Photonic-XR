import { useUI } from '../engine/store';

export default function StartScreen({ onStart }) {
    const input = useUI((s) => s.input);
    const error = useUI((s) => s.inputError);
    const loading = input === 'loading';

    return (
        <div className="overlay start">
            <div className="start-inner">
                <div className="eyebrow">Spatial interface experiment · v2</div>
                <h1 className="title">PHOTONIC</h1>
                <p className="lede">
                    Your screen becomes a window. Your hands reach through it.
                    <br />No headset, just a webcam and some AI running on this laptop.
                </p>
                <div className="start-actions">
                    <button className="btn primary" disabled={loading} onClick={() => onStart('camera')}>
                        {loading ? <><span className="spinner" /> Waking up the AI…</> : 'Enable camera'}
                    </button>
                    <button className="btn ghost" disabled={loading} onClick={() => onStart('mouse')}>
                        Use mouse instead
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
