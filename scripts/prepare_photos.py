"""Precompute everything heavy so the browser only runs hand + face tracking.

For each photo in public/local/src it writes:
  public/local/photos/<id>.jpg   resized photo
  public/local/depth/<id>.png    Depth Anything V2 depth map (white = near)
and public/local/manifest.json with a CLIP category, a 3D "galaxy" position
(photos that look alike sit near each other) and a dominant colour.

Run: python3 scripts/prepare_photos.py                 (your photos, public/local)
     python3 scripts/prepare_photos.py --set demo      (the dog photos, public/demo)
"""
import argparse, json, os, glob
import numpy as np
import torch
from PIL import Image, ImageOps
from transformers import pipeline, CLIPModel, CLIPProcessor

ap = argparse.ArgumentParser()
ap.add_argument('--set', choices=['local', 'demo'], default='local')
SET = ap.parse_args().set
ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', SET)
SRC = os.path.join(ROOT, 'src') if SET == 'local' else os.path.join(ROOT, '..', 'photos')
CATEGORIES = {
    'Bruzo': 'a photo of a black dog',
    'Jimmy': 'a photo of a light brown tan dog',
} if SET == 'demo' else {
    'Portraits': 'a close-up portrait photo of one person',
    'Crew': 'a photo of a group of friends or family',
    'Places': 'a landscape photo of mountains, sea or sky',
    'Dogs': 'a photo of a dog',
    'Art': 'a charcoal drawing or sketch',
}

device = 'mps' if torch.backends.mps.is_available() else 'cpu'
os.makedirs(os.path.join(ROOT, 'photos'), exist_ok=True)
os.makedirs(os.path.join(ROOT, 'depth'), exist_ok=True)

depth = pipeline('depth-estimation', model='depth-anything/Depth-Anything-V2-Small-hf', device=device)
clip = CLIPModel.from_pretrained('openai/clip-vit-base-patch32').to(device)
proc = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')

with torch.no_grad():
    t = proc(text=list(CATEGORIES.values()), return_tensors='pt', padding=True).to(device)
    text_emb = torch.nn.functional.normalize(clip.get_text_features(**t), dim=-1)

items, embs = [], []
for i, path in enumerate(sorted(glob.glob(os.path.join(SRC, '*.jpg')) + glob.glob(os.path.join(SRC, '*.webp')))):
    pid = f'p{i:02d}'
    img = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    img.thumbnail((1024, 1024))
    img.save(os.path.join(ROOT, 'photos', pid + '.jpg'), quality=85)

    d = depth(img)['depth']  # PIL L image, bright = near
    d = d.resize((max(1, img.width // 2), max(1, img.height // 2)))
    arr = np.asarray(d).astype(np.float32)
    arr = (arr - arr.min()) / max(1e-6, arr.max() - arr.min()) * 255
    Image.fromarray(arr.astype(np.uint8)).save(os.path.join(ROOT, 'depth', pid + '.png'))

    with torch.no_grad():
        e = clip.get_image_features(**proc(images=img, return_tensors='pt').to(device))
        e = torch.nn.functional.normalize(e, dim=-1)
    scores = (e @ text_emb.T).softmax(-1)[0].cpu().numpy()
    embs.append(e[0].cpu().numpy())

    small = np.asarray(img.resize((24, 24))).reshape(-1, 3).astype(np.float32)
    sat = small.max(1) - small.min(1)  # favour colourful pixels for the glow colour
    col = (small * (sat[:, None] + 10)).sum(0) / (sat + 10).sum()

    items.append({
        'id': pid,
        'src': f'/{SET}/photos/{pid}.jpg',
        'depth': f'/{SET}/depth/{pid}.png',
        'aspect': round(img.width / img.height, 4),
        'category': list(CATEGORIES)[int(scores.argmax())],
        'confidence': round(float(scores.max()), 3),
        'color': '#%02x%02x%02x' % tuple(int(c) for c in col),
    })
    print(pid, os.path.basename(path), items[-1]['category'])

# 3D layout: PCA of CLIP embeddings, so similar photos cluster together.
E = np.stack(embs)
E = E - E.mean(0)
_, _, vt = np.linalg.svd(E, full_matrices=False)
xyz = E @ vt[:3].T
xyz = xyz / np.abs(xyz).max(0)
for it, p in zip(items, xyz):
    it['galaxy'] = [round(float(v), 4) for v in p]

json.dump({'categories': list(CATEGORIES), 'photos': items},
          open(os.path.join(ROOT, 'manifest.json'), 'w'), indent=1)
print('wrote', len(items), 'photos')
