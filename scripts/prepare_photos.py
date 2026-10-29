"""Precompute everything heavy so the browser only runs hand + face tracking.

For each photo it writes, under public/<set>/:
  photos/<id>.jpg     resized photo
  depth/<id>.png      Depth Pro metric depth, log-encoded (white = near)
and manifest.json with each photo's depth range, focus distance and field of view,
a CLIP category, a 3D "galaxy" position (look-alike photos sit together) and a colour.

Depth Pro (Apple) gives real distances in metres and the camera's field of view, so the
browser can put every pixel back on its true line of sight instead of just pushing the
photo out by a fixed amount.

Run: python3 scripts/prepare_photos.py                 (your photos, public/local)
     python3 scripts/prepare_photos.py --set demo      (the dog photos, public/demo)
"""
import argparse, gc, hashlib, json, os, glob
import cv2
import numpy as np
import torch
from PIL import Image, ImageOps

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
CACHE = os.path.expanduser('~/.cache/photonic-depth')
os.makedirs(CACHE, exist_ok=True)
for d in ['photos', 'depth']:
    os.makedirs(os.path.join(ROOT, d), exist_ok=True)

paths = sorted(glob.glob(os.path.join(SRC, '*.jpg')) + glob.glob(os.path.join(SRC, '*.webp')))
images = []
for path in paths:
    img = ImageOps.exif_transpose(Image.open(path)).convert('RGB')
    img.thumbnail((1024, 1024))
    images.append(img)


def encode(depth, near, far):
    """Log-depth to 8 bits, white = near. Log keeps detail on faces and still covers far hills."""
    t = (np.log(np.clip(depth, near, far)) - np.log(near)) / (np.log(far) - np.log(near))
    return ((1 - t) * 255).round().astype(np.uint8)


# ---- pass 1: depth (one model in memory at a time keeps the Air out of swap) ----
from transformers import AutoImageProcessor, DepthProForDepthEstimation
dproc = dmodel = None  # loaded only if some photo isn't cached yet

meta = []
for i, img in enumerate(images):
    pid = f'p{i:02d}'
    img.save(os.path.join(ROOT, 'photos', pid + '.jpg'), quality=85)
    w, h = max(1, img.width // 2), max(1, img.height // 2)
    # Depth Pro is the slow part, so its raw output is cached outside the repo.
    key = hashlib.sha1(np.asarray(img).tobytes()).hexdigest()[:16]
    cached = os.path.join(CACHE, key + '.npz')
    if os.path.exists(cached):
        z = np.load(cached)
        depth, fov = z['depth'].astype(np.float32), float(z['fov'])
    else:
        if dmodel is None:
            dproc = AutoImageProcessor.from_pretrained('apple/DepthPro-hf')
            dmodel = DepthProForDepthEstimation.from_pretrained('apple/DepthPro-hf', torch_dtype=torch.float16).to(device).eval()
        with torch.no_grad():
            out = dmodel(**dproc(images=img, return_tensors='pt').to(device, torch.float16))
        post = dproc.post_process_depth_estimation(out, target_sizes=[(h, w)])[0]
        depth = post['predicted_depth'].float().cpu().numpy()
        fov = float(post['field_of_view']) if post.get('field_of_view') is not None else 60.0
        np.savez_compressed(cached, depth=depth.astype(np.float16), fov=fov)
        torch.mps.empty_cache() if device == 'mps' else None

    # Focus (the depth the photo plane sits at) = the subject: pixels standing clearly in
    # front of something farther nearby, i.e. people and objects rather than walls or sky.
    logd = np.log(np.maximum(depth, 1e-3))
    k = max(7, int(0.07 * max(w, h)))
    farthest_near = cv2.dilate(logd, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
    subject = (farthest_near - logd) > 0.25
    focus = float(np.median(depth[subject])) if subject.mean() > 0.005 else float(np.percentile(depth, 30))
    near = max(0.05, float(np.percentile(depth, 0.5)) * 0.95)
    far = max(near * 1.5, min(float(np.percentile(depth, 99.5)), focus * 6))
    Image.fromarray(encode(depth, near, far)).save(os.path.join(ROOT, 'depth', pid + '.png'))

    item = {'near': round(near, 4), 'far': round(far, 4), 'focus': round(focus, 4), 'fov': round(fov, 2)}
    meta.append(item)
    print(pid, f"fov {fov:.0f}°  near {near:.2f}m  focus {focus:.2f}m  far {far:.2f}m", flush=True)

del dmodel
gc.collect()
torch.mps.empty_cache() if device == 'mps' else None

# ---- pass 2: CLIP categories + galaxy layout ----
from transformers import CLIPModel, CLIPProcessor
clip = CLIPModel.from_pretrained('openai/clip-vit-base-patch32').to(device)
proc = CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32')
with torch.no_grad():
    t = proc(text=list(CATEGORIES.values()), return_tensors='pt', padding=True).to(device)
    text_emb = torch.nn.functional.normalize(clip.get_text_features(**t), dim=-1)

items, embs = [], []
for i, (img, m) in enumerate(zip(images, meta)):
    pid = f'p{i:02d}'
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
        'depthMeta': {k: m[k] for k in ['near', 'far', 'focus', 'fov']},
        'aspect': round(img.width / img.height, 4),
        'category': list(CATEGORIES)[int(scores.argmax())],
        'confidence': round(float(scores.max()), 3),
        'color': '#%02x%02x%02x' % tuple(int(c) for c in col),
    })

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
