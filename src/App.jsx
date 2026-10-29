import { useEffect, useRef } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { Tracker } from './engine/tracker';
import { Stage } from './engine/stage';
import { ui, useUI } from './engine/store';
import { audio } from './engine/audio';
import { GalaxyDemo } from './demos/galaxy';
import { DrawDemo } from './demos/draw';
import { ThereminDemo } from './demos/theremin';
import { SplatsDemo } from './demos/splats';
import StartScreen from './ui/StartScreen';
import Menu from './ui/Menu';
import Hud from './ui/Hud';
import Debug from './ui/Debug';

const DEMOS = {
    galaxy: GalaxyDemo,
    draw: DrawDemo,
    theremin: ThereminDemo,
    splats: SplatsDemo,
};

// Tracker + stage live outside React: they run every frame and must never re-render.
const engine = { current: null };

async function openDemo(id) {
    ui.set({ screen: 'demo', demo: id, coach: {} });
    await engine.current.stage.setDemo(DEMOS[id]);
}

async function openMenu() {
    ui.set({ screen: 'menu', demo: null });
    await engine.current.stage.setDemo(null);
}

function App() {
    const mount = useRef(null);
    const screen = useUI((s) => s.screen);
    const input = useUI((s) => s.input);

    useEffect(() => {
        const tracker = new Tracker();
        const stage = new Stage(mount.current, tracker);
        engine.current = { tracker, stage };
        if (import.meta.env.DEV) window.photonic = engine.current; // handy in the console
        const onKey = (e) => {
            if (e.key === 'd') ui.set({ debug: !ui.get().debug });
            if (e.key === 'Escape' && ui.get().screen === 'demo' && !ui.get().focused) openMenu();
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            stage.dispose();
            tracker.stop();
        };
    }, []);

    useEffect(() => {
        document.body.classList.toggle('mouse-mode', input === 'mouse');
    }, [input]);

    const start = async (mode) => {
        audio.init();
        const { tracker } = engine.current;
        if (mode === 'mouse') {
            tracker.startMouse();
            ui.set({ input: 'mouse', screen: 'menu' });
            audio.boot();
            return;
        }
        ui.set({ input: 'loading' });
        try {
            await tracker.startCamera();
            ui.set({ input: 'camera', screen: 'menu' });
            audio.boot();
        } catch (e) {
            console.error(e);
            ui.set({ input: 'error', inputError: e?.name === 'NotAllowedError' ? 'Camera access was blocked.' : 'Could not start hand tracking.' });
        }
    };

    return (
        <ErrorBoundary>
            <div className="app">
                <div ref={mount} className="stage" />
                {screen === 'start' && <StartScreen onStart={start} />}
                {screen === 'menu' && <Menu onOpen={openDemo} />}
                {screen === 'demo' && <Hud onBack={openMenu} />}
                <Debug engine={engine} />
            </div>
        </ErrorBoundary>
    );
}

export default App;
