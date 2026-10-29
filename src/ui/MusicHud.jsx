import { ui, useUI } from '../engine/store';
import { INSTRUMENTS, SONGS, letter } from '../demos/music';
import { pickInstrument } from '../demos/theremin';
import { changeTempo } from '../demos/choir';

// Plain step-by-step instructions, worded for whatever you're using right now.
const HOWTO = {
    free: {
        mouse: ['Click anywhere to play a note.', 'Higher on the screen = higher note.', 'Hold the click and slide up or down to play a run.', 'Pick a sound at the bottom, or press ← →.'],
        camera: ['Pinch your right thumb and finger to play.', 'Move that hand up or down to change the note.', 'Raise your left hand to play louder.', 'Pinch your left hand to switch sound.'],
    },
    song: {
        mouse: ['Click anywhere. Every click plays the next note of the song.', 'Click in time with the tune you know. It waits for you.', 'Click near the bottom or top to play it lower or higher.', 'Pick a sound at the bottom, or press ← →.'],
        camera: ['Pinch. Every pinch plays the next note of the song.', 'Pinch in time with the tune you know. It waits for you.', 'Hand low or high plays it lower or higher.', 'Pinch your left hand to switch sound.'],
    },
    choir: {
        mouse: ['The choir sings by itself. You conduct.', 'Mouse up = louder, down = softer.', 'Left to right changes the vowel, from "oo" to "ee".', 'Hold the click to hold a note. Hold F to cut them off.', '↑ ↓ or the buttons below change the speed.'],
        camera: ['The choir sings by itself. You conduct.', 'Raise your right hand = louder, lower = softer.', 'Move it left or right to change the vowel.', 'Pinch to hold a note. Make a fist to cut them off.', 'Your left hand\'s height sets the speed.'],
    },
};

export default function MusicHud({ demo, input }) {
    const inst = useUI((s) => s.thereminInst);
    const songId = useUI((s) => s.thereminSong);
    const songPos = useUI((s) => s.thereminSongPos);
    const note = useUI((s) => s.thereminNote);
    const choirSong = useUI((s) => s.choirSong);
    const choirInfo = useUI((s) => s.choirInfo);
    const choirNote = useUI((s) => s.choirNote);
    const tempo = useUI((s) => s.choirTempo);
    const how = input === 'camera' ? 'camera' : 'mouse';
    const mode = demo === 'choir' ? 'choir' : songId ? 'song' : 'free';
    const song = SONGS.find((x) => x.id === songId);

    return (
        <>
            <div className="music-top">
                {demo === 'theremin' && (
                    <div className="seg">
                        <button data-hand className={!songId ? 'on' : ''} onClick={() => ui.set({ thereminSong: null })}>Free play</button>
                        <button data-hand className={songId ? 'on' : ''} onClick={() => ui.set({ thereminSong: songId || SONGS[0].id, thereminSongPos: 0 })}>Play a song</button>
                    </div>
                )}
                {(demo === 'choir' || songId) && (
                    <div className="seg songs">
                        {SONGS.map((x) => {
                            const on = demo === 'choir' ? choirSong === x.id : songId === x.id;
                            return (
                                <button data-hand key={x.id} className={on ? 'on' : ''}
                                    onClick={() => ui.set(demo === 'choir' ? { choirSong: x.id } : { thereminSong: x.id, thereminSongPos: 0 })}>
                                    {x.name}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="howto">
                <div className="howto-h">How to play</div>
                <ol>{HOWTO[mode][how].map((line) => <li key={line}>{line}</li>)}</ol>
            </div>

            {demo === 'theremin' && (
                <>
                    <div className={`big-note ${note ? 'on' : ''}`}>{note || '—'}</div>
                    {song && (
                        <div className="song-strip">
                            {[-2, -1, 0, 1, 2, 3, 4].map((o) => {
                                const i = songPos + o;
                                if (i < 0 || i >= song.notes.length) return <span key={o} className="gap" />;
                                return <span key={o} className={o < 0 ? 'past' : o === 0 ? 'next' : ''}>{letter(song.notes[i].midi)}</span>;
                            })}
                            <i>{songPos === 0 ? 'Ready: click to start' : `${songPos} / ${song.notes.length}`}</i>
                        </div>
                    )}
                    <div className="inst-dock">
                        <button data-hand className="chip arrow" aria-label="Previous sound" onClick={() => pickInstrument(-1)}>‹</button>
                        {INSTRUMENTS.map((i, n) => (
                            <button data-hand key={i.id} className={`inst ${inst === i.id ? 'on' : ''}`} title={`${i.name} (${n + 1})`} onClick={() => ui.set({ thereminInst: i.id })}>
                                <span className="icon">{i.icon}</span>
                                <span className="name">{i.name}</span>
                            </button>
                        ))}
                        <button data-hand className="chip arrow" aria-label="Next sound" onClick={() => pickInstrument(1)}>›</button>
                    </div>
                </>
            )}

            {demo === 'choir' && choirInfo && (
                <div className="choir-dock">
                    <span className="stat"><b>Loudness</b>{choirInfo.dyn}</span>
                    <span className="stat"><b>Vowel</b>“{choirInfo.vowel}”</span>
                    <span className="stat"><b>Melody</b>{choirNote || '—'}</span>
                    <span className="stat tempo">
                        <button data-hand className="chip arrow" aria-label="Slower" onClick={() => changeTempo(-0.1)}>−</button>
                        <b>Speed</b>{choirInfo.bpm} bpm
                        <button data-hand className="chip arrow" aria-label="Faster" onClick={() => changeTempo(0.1)}>+</button>
                    </span>
                    {tempo !== 1 && <button data-hand className="chip reset" onClick={() => ui.set({ choirTempo: 1 })}>Reset speed</button>}
                    <span className={`stat hold ${choirInfo.held ? 'on' : ''}`}>{choirInfo.dyn === 'silent' ? 'Cut off' : choirInfo.held ? 'Holding…' : 'Singing'}</span>
                </div>
            )}
        </>
    );
}
