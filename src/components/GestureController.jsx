import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const GestureController = ({ onHandUpdate }) => {
    const videoRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const [cameraError, setCameraError] = useState(null);
    const requestRef = useRef();
    // Smoothing State - Moved to top level
    const smoothRef = useRef({ x: null, y: null });

    useEffect(() => {
        let handLandmarker = null;

        const setupMediaPipe = async () => {
            try {
                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );

                handLandmarker = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: {
                        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                        delegate: "GPU"
                    },
                    runningMode: "VIDEO",
                    numHands: 1
                });
                setLoaded(true);
                startWebcam();
            } catch (e) {
                console.error("GestureController: Init Error", e);
                setCameraError("AI Init Failed");
            }
        };

        const startWebcam = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.addEventListener('loadeddata', () => {
                        predictWebcam();
                    });
                }
            } catch (err) {
                setCameraError("Camera Access Denied");
            }
        };

        // Smoothing State (Moved to top level)

        const predictWebcam = () => {
            if (!handLandmarker || !videoRef.current) return;

            if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
                requestRef.current = requestAnimationFrame(predictWebcam);
                return;
            }

            let startTimeMs = performance.now();
            const results = handLandmarker.detectForVideo(videoRef.current, startTimeMs);

            if (results.landmarks && results.landmarks.length > 0) {
                const landmarks = results.landmarks[0];

                // Landmark Indices:
                // 0: Wrist
                // 4: Thumb Tip
                // 8: Index Tip
                // 12: Middle Tip
                // 16: Ring Tip
                // 20: Pinky Tip

                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                const middleTip = landmarks[12];
                const ringTip = landmarks[16];
                const pinkyTip = landmarks[20];
                const wrist = landmarks[0];

                // --- Pinch Detection (Thumb + Index) ---
                const pinchDistance = Math.sqrt(
                    Math.pow(indexTip.x - thumbTip.x, 2) +
                    Math.pow(indexTip.y - thumbTip.y, 2)
                );
                const isPinching = pinchDistance < 0.08;

                // --- Fist Detection (Tips close to wrist) ---
                const getDistToWrist = (point) => {
                    return Math.sqrt(Math.pow(point.x - wrist.x, 2) + Math.pow(point.y - wrist.y, 2));
                };

                // Tightened threshold: 0.18 (was 0.25) to prevent accidental deletions
                const indexDist = getDistToWrist(indexTip);
                const middleDist = getDistToWrist(middleTip);
                const ringDist = getDistToWrist(ringTip);
                const pinkyDist = getDistToWrist(pinkyTip);

                // Restored Threshold: 0.25 (User confirmed this worked previously)
                const FIST_THRESHOLD = 0.25;

                // Removed !isPinching strictness to ensure fist is detected even if thumb/index are close
                const isFist = (indexDist < FIST_THRESHOLD) && (middleDist < FIST_THRESHOLD) && (ringDist < FIST_THRESHOLD) && (pinkyDist < FIST_THRESHOLD);

                // --- SMOOTHING (EMA) ---
                const rawX = 1 - indexTip.x; // Mirror X
                const rawY = indexTip.y;

                // Increased Alpha: 0.5 (was 0.2) for "Buttery Smooth" responsiveness
                // Higher = Faster, Lower = Smoother. 0.5 is a good hybrid.
                const alpha = 0.5;

                let currX = rawX;
                let currY = rawY;

                if (smoothRef.current.x !== null) {
                    currX = smoothRef.current.x * (1 - alpha) + rawX * alpha;
                    currY = smoothRef.current.y * (1 - alpha) + rawY * alpha;
                }

                smoothRef.current = { x: currX, y: currY };

                onHandUpdate && onHandUpdate({
                    x: currX,
                    y: currY,
                    isPinching,
                    isFist
                });

            } else {
                // Reset smoothing if hand lost to avoid "drifting" back from old position
                smoothRef.current = { x: null, y: null };
                onHandUpdate && onHandUpdate({
                    x: null, y: null, isPinching: false, isFist: false
                });
            }

            requestRef.current = requestAnimationFrame(predictWebcam);
        };

        setupMediaPipe();

        return () => {
            if (videoRef.current && videoRef.current.srcObject) {
                videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            }
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
            if (handLandmarker) handLandmarker.close();
        };
    }, []);

    return (
        <div className="fixed bottom-6 right-6 w-32 h-24 rounded-lg overflow-hidden border-2 border-white/20 shadow-lg z-[9999] bg-black opacity-80 hover:opacity-100 transition-opacity">
            {!loaded && !cameraError && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-white bg-gray-900/90 z-20">
                    <div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin mr-2" />
                    Loading AI...
                </div>
            )}

            {cameraError && (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-red-300 bg-red-900/90 z-20 font-bold px-2 text-center">
                    {cameraError}
                </div>
            )}

            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform -scale-x-100"
            />
        </div>
    );
};

export default GestureController;
