import { useState } from 'react';
import LandingPage from './LandingPage';
import OnboardingFlow from './OnboardingFlow';
import PhotoSorter from './PhotoSorter';

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

const PhotoSorterDemo = ({ handState, onExit }) => {
    const [started, setStarted] = useState(false);
    const [onboardingComplete, setOnboardingComplete] = useState(false);

    // When sorting logic finishes (in PhotoSorter, when queue empty)
    // we need to trigger onExit. 
    // BUT PhotoSorter currently renders "All Sorted".
    // We will modify PhotoSorter to call onComplete when done instead.

    return (
        <div className={`w-full h-full ${started ? 'cursor-none' : ''}`}>
            {!started ? (
                <LandingPage onStart={() => setStarted(true)} />
            ) : !onboardingComplete ? (
                <OnboardingFlow
                    handState={handState}
                    onComplete={() => setOnboardingComplete(true)}
                    onSkip={() => setOnboardingComplete(true)}
                />
            ) : (
                <div className="relative z-10 w-full h-full">
                    <div className="absolute top-8 inset-x-0 text-center z-50 pointer-events-none">
                        <h1 className="text-2xl font-black tracking-tighter text-gray-900/50">PHOTONIC XR</h1>
                    </div>

                    <PhotoSorter
                        photos={PHOTOS}
                        handState={handState}
                        onComplete={onExit}
                    />
                </div>
            )}
        </div>
    );
};

export default PhotoSorterDemo;
