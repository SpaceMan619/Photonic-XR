import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import PhotoStack from './PhotoStack';

const PhotoSorter = ({ photos, handState }) => {
    const [queue, setQueue] = useState(photos);
    const [bruzoCount, setBruzoCount] = useState(0);
    const [jimmyCount, setJimmyCount] = useState(0);
    const [deletedCount, setDeletedCount] = useState(0);

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

    if (!currentPhoto) {
        return (
            <div className="text-center">
                <h2 className="text-4xl font-black mb-4">All Sorted!</h2>
                <div className="flex gap-8 text-xl font-mono">
                    <div className="text-blue-600">Bruzo: {bruzoCount}</div>
                    <div className="text-amber-600">Jimmy: {jimmyCount}</div>
                    <div className="text-red-600">Deleted: {deletedCount}</div>
                </div>
                <button
                    onClick={() => window.location.reload()}
                    className="mt-8 px-6 py-2 bg-gray-900 text-white rounded-full hover:bg-gray-700"
                >
                    Restart
                </button>
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
