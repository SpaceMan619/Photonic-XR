import { useState, useCallback, useEffect } from 'react';
import GestureController from './components/GestureController';
import ErrorBoundary from './components/ErrorBoundary';
import { motion } from 'framer-motion';
import PhotoSorterDemo from './components/PhotoSorterDemo';
import DemoSelection from './components/DemoSelection';

const throttle = (func, limit) => {
  let inThrottle;
  return function () {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

function App() {
  // Global Hand State
  const [handState, setHandState] = useState({ x: null, y: null, isPinching: false, isFist: false });
  const [debugMode, setDebugMode] = useState(true);

  // Navigation State
  // activeDemo: null (Menu) | 'sorter' | 'drawing' ...
  const [activeDemo, setActiveDemo] = useState('sorter'); // Start with sorter for now, or null to start at menu?
  // User asked for "Demo Selection screen to be at END", so maybe start with Sorter? 
  // "I want this to have different demos... Option 1 would be... the demo we just did"
  // Let's start with 'sorter' to preserve existing flow, but when finished, go to Menu.

  // Update Hand State
  const handleHandUpdate = useCallback((state) => {
    setHandState(prev => {
      // Detect Pinch Start (Click)
      if (state.isPinching && !prev.isPinching && state.x !== null) {
        const x = state.x * window.innerWidth;
        const y = state.y * window.innerHeight;
        const element = document.elementFromPoint(x, y);
        if (element) {
          const formatting = { bubbles: true, cancelable: true, view: window };
          element.dispatchEvent(new MouseEvent('mousedown', formatting));
          element.dispatchEvent(new MouseEvent('mouseup', formatting));
          element.click();
        }
      }
      return state;
    });
  }, []);

  // Debug Toggle
  useEffect(() => {
    const toggleDebug = (e) => {
      if (e.key === 'd') setDebugMode(prev => !prev);
    }
    window.addEventListener('keydown', toggleDebug);
    return () => window.removeEventListener('keydown', toggleDebug);
  }, []);

  return (
    <ErrorBoundary>
      <div className="relative w-full h-full bg-white text-gray-900 font-sans select-none overflow-hidden">

        {/* Hand Feature: Virtual Cursor (Always Global) */}
        {handState.x !== null && (
          <motion.div
            layoutId="cursor"
            transition={{ type: "spring", damping: 25, stiffness: 300, mass: 0.5 }}
            animate={{
              x: handState.x * window.innerWidth,
              y: handState.y * window.innerHeight,
              scale: handState.isPinching ? 1.1 : (handState.isFist ? 1.5 : 1)
            }}
            className={`fixed top-0 left-0 w-8 h-8 rounded-full shadow-2xl z-[5000] pointer-events-none flex items-center justify-center mix-blend-multiply
             ${handState.isPinching ? 'bg-blue-600' : 'bg-blue-400/80'}
             ${handState.isFist ? 'bg-purple-600 ring-4 ring-purple-300' : ''}
           `}
          >
            {handState.isPinching && <div className="absolute w-12 h-12 border-4 border-blue-400/30 rounded-full animate-ping" />}
          </motion.div>
        )}

        {/* DEBUG PANEL */}
        {debugMode && (
          <div className="absolute top-2 right-2 bg-black/80 text-green-400 p-2 rounded text-[10px] font-mono z-[5000] pointer-events-none">
            <p>Debug Mode (Press 'd' to toggle)</p>
            <p>X: {handState.x?.toFixed(2)}</p>
            <p>Y: {handState.y?.toFixed(2)}</p>
            <p>Pinch: {handState.isPinching ? "YES" : "NO"}</p>
            <p>Fist: {handState.isFist ? "YES" : "NO"}</p>
          </div>
        )}

        {/* Global Gradient Background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-50 via-gray-100 to-gray-200 z-0" />

        {/* Global Gesture Controller */}
        <GestureController onHandUpdate={handleHandUpdate} />

        {/* MAIN CONTENT AREA */}
        <div className="relative z-10 w-full h-full">
          {/* 1. DEMO SELECTION MENU */}
          {!activeDemo && (
            <DemoSelection onSelectDemo={setActiveDemo} />
          )}

          {/* 2. ACTIVE DEMO: PHOTO SORTER */}
          {activeDemo === 'sorter' && (
            <PhotoSorterDemo
              handState={handState}
              onExit={() => setActiveDemo(null)}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}

export default App;
