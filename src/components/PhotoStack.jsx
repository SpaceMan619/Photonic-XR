import { motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useState, useRef } from 'react';
import { soundManager, SOUND_KEYS } from '../utils/SoundManager';

// STATES
const STATUS = {
    IDLE: 'idle',
    DRAGGING: 'dragging',
    PRE_DELETE: 'pre_delete', // Shaking/Grey
    DELETING: 'deleting',     // Animating out (Fist)
    SORTING: 'sorting',       // Animating out (Drop)
};

const PhotoStack = ({ photo, nextPhoto, handState, onSortLeft, onSortRight, onDelete }) => {
    const [status, setStatus] = useState(STATUS.IDLE);

    // Drag Values (Performant, no re-renders)
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotate = useTransform(x, [-window.innerWidth, window.innerWidth], [-45, 45]);

    // Refs for logic
    const dragStartRef = useRef({ x: 0, y: 0 });
    const fistTimerRef = useRef(0);
    const hasReleasedRef = useRef(false); // Safety guard: Must open hand once before interacting

    const FIST_HOLD_TIME = 1200;

    useEffect(() => {
        // 0. GLOBAL SAFETY: If tracking is lost, reset everything unless we are already animating out
        if (!handState.x) {
            if (status !== STATUS.DELETING && status !== STATUS.SORTING && status !== STATUS.IDLE) {
                setStatus(STATUS.IDLE);
                fistTimerRef.current = 0;
            }
            return;
        }

        // 1. SAFETY GUARD: Wait for open hand
        if (!hasReleasedRef.current) {
            if (!handState.isFist && !handState.isPinching) {
                hasReleasedRef.current = true;
            } else {
                return; // Ignore all input until hand opens
            }
        }

        // STATE MACHINE LOOP
        switch (status) {
            case STATUS.IDLE:
                // -> PRE_DELETE
                if (handState.isFist) {
                    fistTimerRef.current = Date.now();
                    setStatus(STATUS.PRE_DELETE);
                }
                // -> DRAGGING
                else if (handState.isPinching) {
                    dragStartRef.current = { x: handState.x, y: handState.y };
                    setStatus(STATUS.DRAGGING);
                    soundManager.play(SOUND_KEYS.GRAB);
                }
                break;

            case STATUS.PRE_DELETE:
                // -> IDLE (Fist broken)
                if (!handState.isFist) {
                    fistTimerRef.current = 0;
                    setStatus(STATUS.IDLE);
                }
                // -> DELETING (Timer complete)
                else {
                    const elapsed = Date.now() - fistTimerRef.current;
                    if (elapsed > FIST_HOLD_TIME) {
                        setStatus(STATUS.DELETING);
                        soundManager.play(SOUND_KEYS.DELETE);
                        setTimeout(onDelete, 400); // Wait for animation
                    }
                }
                break;

            case STATUS.DRAGGING:
                // -> IDLE or SORTING (Drop)
                if (!handState.isPinching) {
                    const currentX = x.get();
                    const THRESHOLD = 150;

                    if (Math.abs(currentX) > THRESHOLD) {
                        // START SORT ANIMATION
                        setStatus(STATUS.SORTING);
                        soundManager.play(SOUND_KEYS.DROP); // Play "Drop" sound on release

                        // Final callback after animation
                        setTimeout(() => {
                            if (currentX < 0) onSortLeft();
                            else onSortRight();
                        }, 300);
                    } else {
                        // Snap Back
                        setStatus(STATUS.IDLE);
                    }
                }
                // UPDATE POSITION
                else {
                    const deltaX = (handState.x - dragStartRef.current.x) * window.innerWidth * 1.5;
                    const deltaY = (handState.y - dragStartRef.current.y) * window.innerHeight * 1.5;
                    x.set(deltaX);
                    y.set(deltaY);
                }
                break;

            case STATUS.DELETING:
            case STATUS.SORTING:
                // No exit. Waiting for parent to unmount us.
                break;
        }

    }, [handState, status, onDelete, onSortLeft, onSortRight, x, y]);


    // ANIMATION VARIANTS
    const variants = {
        [STATUS.IDLE]: {
            x: 0, y: 0, rotate: 0, scale: 1, filter: "none", opacity: 1,
            transition: { type: "spring", stiffness: 500, damping: 25, mass: 0.5 }
        },
        [STATUS.DRAGGING]: {
            scale: 1.1,
            transition: { duration: 0.2 }
        },
        [STATUS.PRE_DELETE]: {
            scale: 0.9,
            rotate: [0, -4, 4, -4, 4, 0],
            filter: ["grayscale(0%)", "grayscale(100%)", "grayscale(100%) brightness(0.8) sepia(1) saturate(500%) hue-rotate(-50deg)"],
            transition: {
                rotate: { repeat: Infinity, duration: 0.1, ease: "linear" },
                filter: { duration: 0.4 },
                scale: { duration: 0.2 }
            }
        },
        [STATUS.DELETING]: {
            scale: 0, opacity: 0, rotate: 180, filter: "grayscale(100%) brightness(0.5)",
            transition: { duration: 0.35, ease: [0.32, 0, 0.67, 0] }
        },
        [STATUS.SORTING]: {
            scale: 0.2, opacity: 0,
            transition: { duration: 0.3 }
        }
    };

    // Dynamic Scale for Drag Feedback
    const dragScale = useTransform(x, [-400, 0, 400], [0.6, 1.1, 0.6]);

    return (
        <div className="relative w-[300px] h-[450px] md:w-[400px] md:h-[600px] flex items-center justify-center">

            {/* Background Card */}
            {nextPhoto && (
                <div className="absolute inset-0 bg-gray-200 rounded-3xl transform scale-95 translate-y-4 opacity-100 border-4 border-white shadow-xl overflow-hidden pointer-events-none">
                    <img src={nextPhoto.url} alt="Next" className="w-full h-full object-cover opacity-50 grayscale" />
                </div>
            )}

            {/* Active Card */}
            <motion.div
                variants={variants}
                animate={status}
                style={status === STATUS.DRAGGING ? { x, y, rotate, scale: dragScale } : {}}
                initial="idle"
                className={`absolute inset-0 bg-white rounded-3xl shadow-2xl overflow-hidden border-4 border-white 
                    ${status === STATUS.DRAGGING ? 'z-50 shadow-[0_20px_50px_rgba(0,0,0,0.3)]' : ''}
                    ${status === STATUS.PRE_DELETE ? 'border-red-400' : ''}
                `}
            >
                <img src={photo.url} alt="Active" className="w-full h-full object-cover pointer-events-none select-none" draggable="false" />

                {status === STATUS.PRE_DELETE && (
                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/20 backdrop-blur-[2px]">
                        <h1 className="text-4xl font-black text-white uppercase tracking-widest animate-pulse drop-shadow-lg">Deleting...</h1>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default PhotoStack;
