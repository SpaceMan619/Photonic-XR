import { useUI } from '../engine/store';

export default function StatusPill() {
    const input = useUI((s) => s.input);
    const hands = useUI((s) => s.hands);
    const face = useUI((s) => s.face);
    const fps = useUI((s) => s.fps);
    const renderFps = useUI((s) => s.renderFps);
    return (
        <div className="status">
            <span className={`dot ${hands ? 'on' : ''}`} />
            {input === 'mouse' ? 'Mouse mode' : `${hands} hand${hands === 1 ? '' : 's'}`}
            {input === 'camera' && <><span className={`dot ${face ? 'on' : ''}`} />{face ? 'head' : 'no head'}<span className="fps">track {fps}</span></>}
            <span className="fps">{renderFps} fps</span>
        </div>
    );
}
