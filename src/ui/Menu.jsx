import { useUI } from '../engine/store';
import StatusPill from './StatusPill';

const ITEMS = [
    {
        id: 'galaxy',
        name: 'Photo Galaxy',
        line: 'Your photos as 3D objects, grouped by an AI. Grab, throw, sort, open.',
        tags: ['AI depth', 'Head tracking', 'Two hands'],
        glyph: 'galaxy',
    },
    {
        id: 'draw',
        name: 'Light Sculptor',
        line: 'Pinch to draw glowing lines in real 3D space, then turn your sculpture around.',
        tags: ['3D strokes', 'Mirror mode'],
        glyph: 'draw',
    },
    {
        id: 'theremin',
        name: 'Air Theremin',
        line: 'Play music with no instrument. One hand sets the note, the other the volume.',
        tags: ['Synth', 'Spatial audio'],
        glyph: 'theremin',
    },
];

export default function Menu({ onOpen }) {
    const input = useUI((s) => s.input);
    return (
        <div className="overlay menu">
            <header className="menu-head">
                <div className="brand">PHOTONIC</div>
                <StatusPill />
            </header>
            <h2 className="menu-title">Pick an experience</h2>
            <p className="menu-sub">
                {input === 'camera'
                    ? 'Hover with your hand, then pinch (or push forward) to choose.'
                    : 'Click a card. In each demo, click = pinch, scroll = depth.'}
            </p>
            <div className="cards">
                {ITEMS.map((it, i) => (
                    <button key={it.id} data-hand className="card" style={{ '--i': i }} onClick={() => onOpen(it.id)}>
                        <div className={`glyph ${it.glyph}`}><span /><span /><span /></div>
                        <h3>{it.name}</h3>
                        <p>{it.line}</p>
                        <div className="tags">{it.tags.map((t) => <span key={t}>{t}</span>)}</div>
                    </button>
                ))}
            </div>
            <p className="fine menu-fine">Lean your head left and right. The room behind the glass moves like a real window.</p>
        </div>
    );
}
