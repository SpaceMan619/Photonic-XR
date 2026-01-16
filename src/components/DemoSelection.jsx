import { motion } from 'framer-motion';

const DemoSelection = ({ onSelectDemo }) => {

    // DEMO LIST
    const demos = [
        { id: 'sorter', name: 'Photo Sorter', icon: '📸', status: 'ready', description: 'Hand-tracking photo organziation' },
        { id: 'drawing', name: 'Spatial Draw', icon: '🎨', status: 'coming_soon', description: '3D drawing in the air' },
        { id: 'music', name: 'Theremin', icon: '🎵', status: 'coming_soon', description: 'Gesture based music' },
    ];

    return (
        <div className="w-full h-full bg-gray-50 text-gray-900 flex flex-col items-center justify-center relative overflow-hidden">

            {/* Ambient Background */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-gray-100 to-gray-200 z-0" />

            <div className="z-10 text-center max-w-4xl w-full px-8">
                <motion.h1
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-5xl md:text-7xl font-black tracking-tighter mb-4 text-gray-900"
                >
                    SELECT DEMO
                </motion.h1>
                <p className="text-gray-500 text-lg mb-12 uppercase tracking-widest">Photonic XR Experience</p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {demos.map((demo, index) => (
                        <motion.button
                            key={demo.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.1 }}
                            whileHover={demo.status === 'ready' ? { scale: 1.05, y: -5 } : {}}
                            whileTap={demo.status === 'ready' ? { scale: 0.95 } : {}}
                            onClick={() => demo.status === 'ready' && onSelectDemo(demo.id)}
                            className={`
                                relative p-8 rounded-2xl border flex flex-col items-center gap-4 transition-all
                                ${demo.status === 'ready'
                                    ? 'bg-white border-gray-200 hover:border-blue-400 hover:shadow-xl cursor-pointer shadow-sm'
                                    : 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed grayscale'}
                            `}
                        >
                            <div className="text-6xl mb-2">{demo.icon}</div>
                            <h3 className="text-2xl font-bold">{demo.name}</h3>
                            <p className="text-sm text-gray-500">{demo.description}</p>

                            {demo.status !== 'ready' && (
                                <div className="absolute top-4 right-4 text-[10px] font-black uppercase bg-gray-200 px-2 py-1 rounded text-gray-500">
                                    Soon
                                </div>
                            )}
                        </motion.button>
                    ))}
                </div>

                <div className="mt-16 text-xs text-gray-400 font-mono">
                    v0.3.0 • Hand Tracking Active
                </div>
            </div>
        </div>
    );
};

export default DemoSelection;
