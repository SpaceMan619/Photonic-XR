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
        line: 'Play piano, harp, strings and more in the air, or tap along to a song that always lands on the right notes.',
        tags: ['8 instruments', 'Songs'],
        glyph: 'theremin',
    },
    {
        id: 'choir',
        name: 'Choir Conductor',
        line: 'A four-part choir sings a song for you. Your hand shapes how loud, how fast and what vowel they sing.',
        tags: ['Choir', 'Conducting'],
        glyph: 'choir',
    },
    {
        id: 'splats',
        name: 'Splat Worlds',
        line: 'Real places and things captured as millions of soft lights. Turn them, then step inside.',
        tags: ['Gaussian splats', 'Walk-in'],
        glyph: 'splats',
    },
];

export default function Menu({ onOpen }) {
    const input = useUI((s) => s.input);
    return (
        <div className="overlay menu">
            <header className="menu-head">
                <div className="brand">Photonic</div>
                <StatusPill />
            </header>
            <h2 className="menu-title">Where to?</h2>
            <p className="menu-sub">
                {input === 'camera'
                    ? 'hover with your hand, then pinch (or push forward) to step in'
                    : 'click to step in. inside, click is a pinch and scroll is depth'}
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
            <p className="fine menu-fine">lean your head side to side, and the room behind the glass moves like a real window</p>
        </div>
    );
}
