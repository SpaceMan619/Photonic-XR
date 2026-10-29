"""Split each photo into two layers so the 3D view can look around people, like Apple's spatial scenes.

  front: the subject, cut out with a soft edge by Apple Vision (scripts/subject_mask.swift)
  back:  the scene with the subject painted out by LaMa, so there's a real wall behind them

For each photo in public/<set>/manifest.json it writes
  bg/<id>.jpg        the back layer
  depth/<id>.png     RGB: R = front depth, G = back depth, B = subject mask (high bytes)
  depthlo/<id>.png   RGB: R, G = the low bytes of front and back depth (16-bit precision)
and marks the photo with "layers": true and "bg". Photos with no clear subject keep one layer.

Setup (once, outside the repo):
  python3 -m venv --system-site-packages ~/.cache/photonic-lama/venv
  ~/.cache/photonic-lama/venv/bin/pip install --no-deps simple-lama-inpainting
Run: ~/.cache/photonic-lama/venv/bin/python scripts/photo_layers.py [--set demo]
(prepare_photos.py runs this for you at the end.)
"""
import argparse, json, os, subprocess, tempfile
import cv2
import numpy as np
import torch
from PIL import Image

ap = argparse.ArgumentParser()
ap.add_argument('--set', choices=['local', 'demo'], default='local')
SET = ap.parse_args().set
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, '..', 'public', SET)
os.makedirs(os.path.join(ROOT, 'bg'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'depthlo'), exist_ok=True)

manifest_path = os.path.join(ROOT, 'manifest.json')
manifest = json.load(open(manifest_path))
photos = manifest['photos']

# ---- subject masks, all photos in one Vision run ----
tmp = tempfile.mkdtemp()
args = []
for p in photos:
    args += [os.path.join(ROOT, 'photos', p['id'] + '.jpg'), os.path.join(tmp, p['id'] + '.png')]
subprocess.run(['swift', os.path.join(HERE, 'subject_mask.swift'), *args], check=True)

from simple_lama_inpainting import SimpleLama
lama = SimpleLama(device=torch.device('mps' if torch.backends.mps.is_available() else 'cpu'))



def save_depth(pid, front, back, mask, w, h):
    """Split 16-bit depth into high bytes (depth png, with the mask) and low bytes (depthlo png)."""
    size = (max(1, w // 2), max(1, h // 2))
    # Depth Pro's cached output is float16, so faces come out in tiny terraces that show as
    # contour lines from the side. Surfaces are smooth, so a light blur removes them.
    sigma = max(w, h) / 400
    front = cv2.GaussianBlur(front.astype(np.float32), (0, 0), sigma)
    back = cv2.GaussianBlur(back.astype(np.float32), (0, 0), sigma * 2)
    f = cv2.resize(front, size, interpolation=cv2.INTER_AREA).round().clip(0, 65535).astype(np.uint16)
    b = cv2.resize(back, size, interpolation=cv2.INTER_AREA).round().clip(0, 65535).astype(np.uint16)
    m = cv2.resize(mask, size, interpolation=cv2.INTER_AREA)
    hi = np.stack([f >> 8, b >> 8, m], -1).astype(np.uint8)
    lo = np.stack([f & 255, b & 255, np.zeros_like(m)], -1).astype(np.uint8)
    Image.fromarray(hi).save(os.path.join(ROOT, 'depth', pid + '.png'))
    Image.fromarray(lo).save(os.path.join(ROOT, 'depthlo', pid + '.png'))


for p in photos:
    pid = p['id']
    img = Image.open(os.path.join(ROOT, 'photos', pid + '.jpg')).convert('RGB')
    w, h = img.size
    path16 = os.path.join(ROOT, 'depth16', pid + '.png')
    if not os.path.exists(path16):
        print(pid, 'skipped: run prepare_photos.py first (needs depth16)', flush=True)
        continue
    d16 = cv2.resize(np.asarray(Image.open(path16)).astype(np.uint16), (w, h), interpolation=cv2.INTER_LINEAR)
    mpath = os.path.join(tmp, pid + '.png')
    mask = np.asarray(Image.open(mpath).convert('L').resize((w, h))) if os.path.exists(mpath) else None
    cover = (mask > 127).mean() if mask is not None else 0
    p['depthLo'] = f'/{SET}/depthlo/{pid}.png'

    if mask is None or not 0.02 < cover < 0.9:
        # No clear subject (or it fills the frame): one layer, same depth front and back.
        save_depth(pid, d16.astype(np.float32), d16.astype(np.float32), np.zeros((h, w), np.uint8), w, h)
        p.pop('layers', None); p.pop('bg', None)
        print(pid, 'one layer', f'(subject {cover:.0%})', flush=True)
        continue

    k = max(5, int(0.025 * max(w, h))) | 1
    hard = (mask > 127).astype(np.uint8)
    # Paint out a little more than the subject so no edge pixels (hair, halo) stay on the wall.
    grown = cv2.dilate(hard, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    back = lama(img, Image.fromarray(grown * 255)).crop((0, 0, w, h))
    back.save(os.path.join(ROOT, 'bg', pid + '.jpg'), quality=88)

    # Back depth: fill the hole from the surrounding scene.
    back_d = cv2.inpaint(d16, grown, max(3, k // 2), cv2.INPAINT_TELEA).astype(np.float32)
    # Front depth: the subject's own depth, carried a little past its edge so the
    # soft mask fades over a smooth surface instead of the depth model's blurry rim.
    core = cv2.erode(hard, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    spread = cv2.dilate(d16.astype(np.float32) * core, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k * 2 + 1, k * 2 + 1)))
    front_d = np.where(core > 0, d16.astype(np.float32), np.maximum(spread, back_d))

    save_depth(pid, front_d, back_d, mask, w, h)
    p['layers'] = True
    p['bg'] = f'/{SET}/bg/{pid}.jpg'
    print(pid, 'two layers', f'(subject {cover:.0%})', flush=True)

json.dump(manifest, open(manifest_path, 'w'), indent=1)
print('layered', sum(1 for p in photos if p.get('layers')), 'of', len(photos), 'photos')
