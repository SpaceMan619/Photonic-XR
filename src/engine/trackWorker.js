// Hand + face tracking on a background thread. Each model takes ~15 ms per frame on
// an M-series Air; on the main thread that blocked rendering and dropped frames.
// Here the render loop never waits: it hands over frames and reads results when they land.
import { FilesetResolver, HandLandmarker, FaceLandmarker } from '@mediapipe/tasks-vision';

// MediaPipe loads its wasm glue with importScripts(), which throws in module workers.
// A synchronous fetch + global eval does the same job.
self.importScripts = (...urls) => {
    for (const url of urls) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.send();
        (0, eval)(xhr.responseText);
    }
};

const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm';
let hands, face;

async function init(origin) {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const canvas = new OffscreenCanvas(1, 1); // GPU delegate needs a WebGL context of its own
    [hands, face] = await Promise.all([
        HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${origin}/models/hand_landmarker.task`, delegate: 'GPU' },
            canvas,
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5,
        }),
        FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: `${origin}/models/face_landmarker.task`, delegate: 'GPU' },
            canvas: new OffscreenCanvas(1, 1),
            runningMode: 'VIDEO',
            numFaces: 1,
        }),
    ]);
}

self.onmessage = async (e) => {
    const msg = e.data;
    if (msg.type === 'init') {
        try {
            await init(msg.origin);
            self.postMessage({ type: 'ready' });
        } catch (err) {
            self.postMessage({ type: 'error', message: String(err?.message || err) });
        }
        return;
    }
    if (msg.type === 'frame') {
        const { bitmap, t, doFace } = msg;
        const h0 = performance.now();
        const hr = hands.detectForVideo(bitmap, t);
        const h1 = performance.now();
        let iris = null;
        if (doFace) {
            const fr = face.detectForVideo(bitmap, t);
            const lm = fr.faceLandmarks?.[0];
            // Only the two iris centres are needed for head position.
            if (lm && lm.length > 473) iris = [lm[468], lm[473]];
        }
        const h2 = performance.now();
        bitmap.close();
        self.postMessage({
            type: 'result', t, hands: hr.landmarks || [], iris, doFace,
            handMs: h1 - h0, faceMs: h2 - h1,
        });
    }
};
