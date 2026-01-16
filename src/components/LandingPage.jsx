import { motion } from 'framer-motion';

const LandingPage = ({ onStart }) => {
    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center p-8 text-center overflow-hidden bg-white">
            {/* Animated Background */}
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white via-gray-100 to-blue-50 animate-gradient-xy">
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-40 mix-blend-soft-light"></div>
            </div>

            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="z-10"
            >
                <h1 className="text-6xl md:text-8xl font-black text-gray-900 mb-6 tracking-tighter">
                    PHOTONIC
                </h1>
                <p className="text-xl md:text-2xl text-gray-500 mb-12 max-w-2xl font-light">
                    Experience the gallery of the future. <br />
                    <span className="text-gray-900 font-medium">Touchless. Immersive. Magical.</span>
                </p>

                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onStart}
                    className="group relative px-8 py-4 bg-black text-white text-lg font-bold rounded-full overflow-hidden shadow-xl transition-shadow hover:shadow-2xl"
                >
                    <span className="relative z-10 flex items-center gap-2">
                        Enter Experience
                        <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                    </span>
                </motion.button>

                <p className="mt-8 text-sm text-gray-400">
                    Requires camera access • Hand gestures enabled
                </p>
            </motion.div>
        </div>
    );
};

export default LandingPage;
