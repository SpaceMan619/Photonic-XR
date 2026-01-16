# Photonic XR 🐾

An experimental, gesture-controlled photo sorting application designed for immersive WebXR environments (like the Meta Quest) using natural hand movements in 2D space.

![Photonic XR Interface](https://via.placeholder.com/800x450.png?text=Photonic+XR+Interface)

## 🌟 The Experience

Photonic XR transforms the mundane task of sorting digital photos into a tactile, physical experience. Using just your hands via a webcam (MediaPipe), you can grab, sort, and delete your memories with natural gestures.

- **Grab & Sort**: Pinch a photo to pick it up. Drag it Left for **Bruzo** (Black Dog) or Right for **Jimmy** (Brown Dog).
- **Tactile Feedback**: Photos shrink and "pop" as you interact with them, accompanied by satisfying sound effects.
- **Gesture Delete**: Not sure about a photo? Close your hand into a **Fist** to incinerate it.

## 🛠️ Tech Stack

- **Framework**: React + Vite
- **Animations**: Framer Motion (State-machine driven physics)
- **Tracking**: @mediapipe/tasks-vision (Hand Landmarker)
- **Styling**: Tailwind CSS
- **Deployment**: Vercel

## 🚀 Getting Started

### Prerequisites

- Node.js (v18+)
- A webcam (if running on desktop) or a Meta Quest headset.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SpaceMan619/Photonic-XR.git
   cd Photonic-XR
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173` in your browser.

## 👐 Interaction Guide

| Action | Gesture |
| :--- | :--- |
| **Cursor Movement** | Move your index finger |
| **Grab/Drag** | Pinch (Thumb + Index finger) |
| **Sort** | Drag to far Left or Right while pinching |
| **Delete** | Hold a Fist (3+ fingers closed) for 1.2 seconds |

## 📁 Project Structure

- `/src/components`: Core UI components including the state-machine driven `PhotoStack`.
- `/src/utils`: Utility helpers like the `SoundManager`.
- `/public/models`: Pre-trained MediaPipe hand landmark models.
- `/public/photos`: The asset library for sorting.

## 📜 Credits

Created by **SpaceMan619**. Inspired by the future of natural human-computer interaction.
