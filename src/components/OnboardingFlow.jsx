import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const OnboardingFlow = ({ handState, onComplete, onSkip }) => {
    const [step, setStep] = useState(0);

    // Use refs to prevent rapid re-renders from clearing timeouts
    const timeoutRef = useRef(null);

    useEffect(() => {
        // Stage 0: Wait for Hand
        if (step === 0 && handState.x !== null) {
            // Only set timeout if not already set
            if (!timeoutRef.current) {
                timeoutRef.current = setTimeout(() => {
                    setStep(1);
                    timeoutRef.current = null;
                }, 800);
            }
        } else if (step === 0 && handState.x === null) {
            // If hand lost, clear timeout
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
        }

        // Stage 1: Wait for Pinch
        if (step === 1 && handState.isPinching) {
            if (!timeoutRef.current) {
                timeoutRef.current = setTimeout(() => {
                    setStep(2);
                    timeoutRef.current = null;
                }, 500);
            }
        }

        // Stage 2: Identity Step (Wait 3 seconds)
        if (step === 2) {
            if (!timeoutRef.current) {
                timeoutRef.current = setTimeout(() => {
                    setStep(3);
                    setTimeout(onComplete, 1500);
                    timeoutRef.current = null;
                }, 3500);
            }
        }
    }, [step, handState.x, handState.isPinching, onComplete]);

    const DogIdentity = () => (
        <div className="flex justify-center gap-12 mb-8">
            <div className="flex flex-col items-center">
                <div className="w-32 h-32 rounded-full bg-blue-500/20 border-4 border-blue-400 flex items-center justify-center text-4xl mb-4">🐾</div>
                <h3 className="text-2xl font-black text-blue-400">BRUZO</h3>
                <p className="text-sm text-gray-400 uppercase tracking-widest font-bold">Black Dog (Left)</p>
            </div>
            <div className="flex flex-col items-center">
                <div className="w-32 h-32 rounded-full bg-amber-500/20 border-4 border-amber-400 flex items-center justify-center text-4xl mb-4">🐕</div>
                <h3 className="text-2xl font-black text-amber-400">JIMMY</h3>
                <p className="text-sm text-gray-400 uppercase tracking-widest font-bold">Brown Dog (Right)</p>
            </div>
        </div>
    );

    const HandIcon = () => (
        <svg className="w-32 h-32 mx-auto mb-6 text-white animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
        </svg>
    );

    const PinchIcon = () => (
        <svg className="w-32 h-32 mx-auto mb-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
        </svg>
    );

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center text-white backdrop-blur-xl">
            <div className="max-w-2xl w-full p-8 text-center relative h-full flex flex-col justify-center">
                <AnimatePresence mode="wait">
                    {step === 0 && (
                        <motion.div
                            key="step0"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, y: -20 }}
                        >
                            <HandIcon />
                            <h1 className="text-6xl font-black tracking-tighter mb-4">RAISE HAND</h1>
                            <p className="text-xl text-gray-400 font-medium">Show your hand to activate the cursor.</p>

                            <div className="mt-8 text-xs font-mono text-gray-600">
                                Status: {handState.x !== null ? <span className="text-green-400">DETECTED ({handState.x.toFixed(2)})</span> : <span className="text-red-500">NO HAND DETECTED</span>}
                            </div>
                        </motion.div>
                    )}

                    {step === 1 && (
                        <motion.div
                            key="step1"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.2 }}
                        >
                            <PinchIcon />
                            <h1 className="text-6xl font-black tracking-tighter mb-4 text-yellow-400">PINCH NOW</h1>
                            <p className="text-2xl text-gray-300">Touch thumb & index finger together to grab.</p>

                            <div className="mt-12">
                                <span className={`inline-block px-8 py-3 rounded-full text-lg font-black tracking-widest transition-all duration-200 transform ${handState.isPinching ? 'bg-green-500 text-black scale-110' : 'bg-gray-800 text-gray-500 scale-100'}`}>
                                    {handState.isPinching ? "GRABBED!" : "WAITING FOR PINCH..."}
                                </span>
                            </div>
                        </motion.div>
                    )}

                    {step === 2 && (
                        <motion.div
                            key="step2"
                            initial={{ opacity: 0, y: 30 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -30 }}
                        >
                            <h1 className="text-5xl font-black tracking-tighter mb-8">KNOW YOUR PUPS</h1>
                            <DogIdentity />
                            <div className="bg-gray-800/50 p-6 rounded-2xl border border-white/10">
                                <p className="text-xl text-gray-300 font-medium">
                                    Sort <span className="text-blue-400 font-black">Bruzo</span> to the Left<br />
                                    Sort <span className="text-amber-400 font-black">Jimmy</span> to the Right
                                </p>
                            </div>
                        </motion.div>
                    )}

                    {step === 3 && (
                        <motion.div
                            key="step3"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                        >
                            <div className="text-8xl mb-6">🚀</div>
                            <h1 className="text-5xl font-black text-white mb-2">
                                All Systems Go
                            </h1>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* SKIP BUTTON */}
                <div className="absolute bottom-10 left-0 right-0">
                    <button
                        onClick={onSkip}
                        className="text-sm text-gray-600 hover:text-white underline uppercase tracking-widest"
                    >
                        Skip Tutorial
                    </button>
                </div>
            </div>
        </div>
    );
};

export default OnboardingFlow;
