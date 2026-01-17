import { useState } from 'react';
import LandingPage from './LandingPage';
import OnboardingFlow from './OnboardingFlow';
import PhotoSorter from './PhotoSorter';

const PHOTOS = [
    { url: '/photos/photo_01.webp', title: '', photographer: '' },
    { url: '/photos/photo_02.webp', title: '', photographer: '' },
    { url: '/photos/photo_03.webp', title: '', photographer: '' },
    { url: '/photos/photo_04.webp', title: '', photographer: '' },
    { url: '/photos/photo_05.webp', title: '', photographer: '' },
    { url: '/photos/photo_06.webp', title: '', photographer: '' },
    { url: '/photos/photo_07.webp', title: '', photographer: '' },
    { url: '/photos/photo_08.webp', title: '', photographer: '' },
    { url: '/photos/photo_09.webp', title: '', photographer: '' },
    { url: '/photos/photo_10.webp', title: '', photographer: '' },
    { url: '/photos/photo_11.webp', title: '', photographer: '' },
    { url: '/photos/photo_12.webp', title: '', photographer: '' },
    { url: '/photos/photo_13.webp', title: '', photographer: '' },
    { url: '/photos/photo_14.webp', title: '', photographer: '' },
    { url: '/photos/photo_15.webp', title: '', photographer: '' },
    { url: '/photos/photo_16.webp', title: '', photographer: '' },
    { url: '/photos/photo_17.webp', title: '', photographer: '' },
    { url: '/photos/photo_18.webp', title: '', photographer: '' },
    { url: '/photos/photo_19.webp', title: '', photographer: '' },
    { url: '/photos/photo_20.webp', title: '', photographer: '' },
    { url: '/photos/photo_21.webp', title: '', photographer: '' },
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
