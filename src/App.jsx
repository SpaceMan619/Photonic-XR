import { useState, useCallback, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import GestureController from './components/GestureController';
import PhotoStack from './components/PhotoStack';
import OnboardingFlow from './components/OnboardingFlow';
import ErrorBoundary from './components/ErrorBoundary';
import { motion } from 'framer-motion';
import PhotoSorter from './components/PhotoSorter';

const PHOTOS = [
  { url: '/photos/20240626_005140.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20190604_180922.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20200526_100239.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20200820_141209.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20210119_174634.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20210218_171021.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20210424_125722.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20220329_011626.jpg', title: '', photographer: '' },
  { url: '/photos/IMG_20220614_220105.jpg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.49 (1).jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.49 (2).jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.49 (3).jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.49.jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.50 (1).jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.50 (2).jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.50.jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.51 (1).jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.51 (2).jpeg', title: '', photographer: '' },
  { url: '/photos/WhatsApp Image 2026-01-14 at 16.15.51.jpeg', title: '', photographer: '' },
];

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
  const [started, setStarted] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  // We pass the full PHOTOS array to PhotoSorter once
  const [handState, setHandState] = useState({ x: null, y: null, isPinching: false, isFist: false });
  const [debugMode, setDebugMode] = useState(true); // Default to true for now

  // Update Hand State
  // Removed throttle to allow 60fps raw updates from GestureController
  const handleHandUpdate = useCallback((state) => {
    setHandState(prev => {
      // Detect Pinch Start (Click)
      if (state.isPinching && !prev.isPinching && state.x !== null) {
        const x = state.x * window.innerWidth;
        const y = state.y * window.innerHeight;
        const element = document.elementFromPoint(x, y);
        if (element) {
          // Dispatch a rigorous click event sequence
          const formatting = { bubbles: true, cancelable: true, view: window };
          element.dispatchEvent(new MouseEvent('mousedown', formatting));
          element.dispatchEvent(new MouseEvent('mouseup', formatting));
          element.click();

          // Visual feedback check (optional)
          // console.log("Clicked:", element);
        }
      }
      return state; // Return new state directly (optimized)
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
      <div className={`relative w-full h-full bg-white text-gray-900 font-sans select-none flex flex-col items-center justify-center overflow-hidden ${started ? 'cursor-none' : ''}`}>

        {/* Hand Feature: Virtual Cursor */}
        {handState.x !== null && (
          <motion.div
            // Use motion component for smooth spring physics
            layoutId="cursor"
            transition={{
              type: "spring",
              damping: 25,
              stiffness: 300,
              mass: 0.5
            }}
            animate={{
              x: handState.x * window.innerWidth,
              y: handState.y * window.innerHeight,
              scale: handState.isPinching ? 1.1 : (handState.isFist ? 1.5 : 1)
            }}
            className={`fixed top-0 left-0 w-8 h-8 rounded-full shadow-2xl z-[100] pointer-events-none flex items-center justify-center mix-blend-multiply
             ${handState.isPinching ? 'bg-blue-600' : 'bg-blue-400/80'}
             ${handState.isFist ? 'bg-purple-600 ring-4 ring-purple-300' : ''}
             ${!started ? 'opacity-0' : 'opacity-100'}
           `}
          >
            {handState.isPinching && <div className="absolute w-12 h-12 border-4 border-blue-400/30 rounded-full animate-ping" />}
          </motion.div>
        )}

        {/* DEBUG PANEL */}
        {debugMode && (
          <div className="absolute top-2 right-2 bg-black/80 text-green-400 p-2 rounded text-[10px] font-mono z-[1000] pointer-events-none">
            <p>Debug Mode (Press 'd' to toggle)</p>
            <p>X: {handState.x?.toFixed(2)}</p>
            <p>Y: {handState.y?.toFixed(2)}</p>
            <p>Pinch: {handState.isPinching ? "YES" : "NO"}</p>
            <p>Fist: {handState.isFist ? "YES" : "NO"}</p>
          </div>
        )}

        {/* Global Background */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-50 via-gray-100 to-gray-200 z-0" />

        {started && <GestureController onHandUpdate={handleHandUpdate} />}

        {!started ? (
          <LandingPage onStart={() => setStarted(true)} />
        ) : !onboardingComplete ? (
          <OnboardingFlow
            handState={handState}
            onComplete={() => setOnboardingComplete(true)}
            onSkip={() => setOnboardingComplete(true)}
          />
        ) : (
          // MAIN APP AREA - PHOTO SORTER
          <div className="relative z-10 w-full h-full">
            <div className="absolute top-8 inset-x-0 text-center z-50 pointer-events-none">
              <h1 className="text-2xl font-black tracking-tighter text-gray-900/50">PHOTONIC XR</h1>
            </div>

            <PhotoSorter
              photos={PHOTOS}
              handState={handState}
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
