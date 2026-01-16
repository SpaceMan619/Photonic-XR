import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PhotoStack from './PhotoStack';

const PhotoSorter = ({ photos, handState, onComplete }) => {
    // Start with a small empty state or initial prop, then shuffle on mount
    const [queue, setQueue] = useState([]);
    const [bruzoCount, setBruzoCount] = useState(0);
    const [jimmyCount, setJimmyCount] = useState(0);
    const [deletedCount, setDeletedCount] = useState(0);

    // Fisher-Yates Shuffle on Mount
    useEffect(() => {
        const shuffled = [...photos];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        setQueue(shuffled);
    }, [photos]);

    // Current active photo is always index 0 of queue
    const currentPhoto = queue[0];
    const nextPhoto = queue[1];

    const handleSortLeft = () => {
        // Sort to Bruzo (Left)
        setBruzoCount(c => c + 1);
        setQueue(q => q.slice(1));
    };

    const handleSortRight = () => {
        // Sort to Jimmy (Right)
        setJimmyCount(c => c + 1);
        setQueue(q => q.slice(1));
    };

    const handleDelete = () => {
        // Fist delete
        setDeletedCount(c => c + 1);
        setQueue(q => q.slice(1));
    };

    // Trigger completion on Fist
    useEffect(() => {
        if (!currentPhoto && onComplete && handState.isFist) {
            onComplete();
        }
    }, [currentPhoto, onComplete, handState.isFist]);

    if (!currentPhoto) {
        return (
            <div className="flex flex-col items-center justify-center w-full h-full text-center relative z-20">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white/80 backdrop-blur-xl p-12 rounded-3xl shadow-2xl border border-white/50"
                >
                    <h2 className="text-6xl font-black text-gray-900 mb-8 tracking-tighter">ALL SORTED!</h2>

                    <div className="flex gap-12 text-2xl font-mono mb-12">
                        <div className="flex flex-col items-center">
                            <span className="text-4xl mb-2">🐾</span>
                            <span className="text-blue-600 font-bold">{bruzoCount}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-4xl mb-2">🐕</span>
                            <span className="text-amber-600 font-bold">{jimmyCount}</span>
                        </div>
                        <div className="flex flex-col items-center">
                            <span className="text-4xl mb-2">🗑️</span>
                            <span className="text-red-500 font-bold">{deletedCount}</span>
                        </div>
                    </div>

                    <div className="mt-4">
                        <span className={`inline-block px-8 py-3 rounded-full text-lg font-black tracking-widest transition-all duration-200 transform ${handState.isFist ? 'bg-purple-600 text-white scale-110' : 'bg-gray-100 text-gray-400 scale-100'}`}>
                            {handState.isFist ? "OPENING MENU..." : "CLENCH FIST TO CONTINUE"}
                        </span>
                    </div>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="relative w-full h-full flex items-center justify-center">
            {/* ZONES */}
            <div className="absolute inset-y-0 left-0 w-1/4 bg-blue-50/50 border-r-4 border-blue-200 flex flex-col items-center justify-center z-0 transition-colors">
                <h3 className="text-4xl font-black text-blue-200 uppercase tracking-widest -rotate-90">Bruzo</h3>
                <span className="text-6xl mt-4 opacity-50">🐾</span>
                <div className="mt-8 text-2xl font-bold text-blue-400">{bruzoCount}</div>
            </div>

            <div className="absolute inset-y-0 right-0 w-1/4 bg-amber-50/50 border-l-4 border-amber-200 flex flex-col items-center justify-center z-0 transition-colors">
                <h3 className="text-4xl font-black text-amber-200 uppercase tracking-widest rotate-90">Jimmy</h3>
                <span className="text-6xl mt-4 opacity-50">🐕</span>
                <div className="mt-8 text-2xl font-bold text-amber-400">{jimmyCount}</div>
            </div>

            {/* STACK */}
            <div className="relative z-10">
                <PhotoStack
                    key={currentPhoto.url} // Re-mount for fresh state on new photo
                    photo={currentPhoto}
                    nextPhoto={nextPhoto}
                    handState={handState}
                    onSortLeft={handleSortLeft}
                    onSortRight={handleSortRight}
                    onDelete={handleDelete}
                />
            </div>

            {/* INSTRUCTIONS */}
            <div className="absolute bottom-10 inset-x-0 text-center pointer-events-none opacity-60">
                <div className="text-xs text-gray-400 font-mono flex justify-center gap-8">
                    <span>← DRAG LEFT (BRUZO)</span>
                    <span className="text-red-400 font-bold">✊ HOLD FIST TO DELETE</span>
                    <span>DRAG RIGHT (JIMMY) →</span>
                </div>
            </div>
        </div>
    );
};

export default PhotoSorter;
