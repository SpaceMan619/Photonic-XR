"""Turn photos into real 3D Gaussian splats with Apple SHARP, then pack them small.

SHARP predicts ~1.2M Gaussians from one photo (about 80 s and 6 GB of memory per photo
on an M4 Air). Its PLY is ~66 MB, so this script prunes near-invisible Gaussians and
writes Niantic's compact .spz format (gzip of quantised arrays), which Spark loads.

Setup (once, outside the repo):
  git clone https://github.com/apple/ml-sharp ~/.cache/photonic-sharp/ml-sharp
  python3 -m venv --system-site-packages ~/.cache/photonic-sharp/venv
  ~/.cache/photonic-sharp/venv/bin/pip install -e ~/.cache/photonic-sharp/ml-sharp
  curl -L -o ~/.cache/photonic-sharp/sharp_2572gikvuh.pt https://ml-site.cdn-apple.com/models/sharp/sharp_2572gikvuh.pt

Run: python3 scripts/photo_splats.py p13 p11 ...   (ids from public/local/manifest.json)
Writes public/local/splats/<id>.spz and public/local/splats.json (git-ignored).
"""
import gzip, json, os, struct, subprocess, sys, tempfile
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL = os.path.join(HERE, '..', 'public', 'local')
SHARP = os.path.expanduser('~/.cache/photonic-sharp')
MAX_SPLATS = 600_000


def read_ply(path):
    with open(path, 'rb') as f:
        props, n, reading = [], 0, False
        while True:
            line = f.readline().decode().strip()
            if line.startswith('element vertex'):
                n = int(line.split()[-1])
                reading = True
            elif line.startswith('element'):
                reading = False
            elif line.startswith('property float') and reading:
                props.append(line.split()[-1])
            if line == 'end_header':
                break
        data = np.frombuffer(f.read(n * len(props) * 4), dtype='<f4').reshape(n, len(props))
    return {p: data[:, i] for i, p in enumerate(props)}


def write_spz(path, g, fractional_bits=12):
    n = len(g['x'])
    pos = np.stack([g['x'], g['y'], g['z']], 1)
    q = np.round(pos * (1 << fractional_bits)).astype(np.int32)
    q = np.clip(q, -(1 << 23), (1 << 23) - 1) & 0xFFFFFF
    pos_b = np.stack([q & 0xFF, (q >> 8) & 0xFF, (q >> 16) & 0xFF], -1).astype(np.uint8).reshape(-1)
    alpha = (255 / (1 + np.exp(-g['opacity']))).clip(0, 255).round().astype(np.uint8)
    color = (np.stack([g['f_dc_0'], g['f_dc_1'], g['f_dc_2']], 1) * 0.15 + 0.5) * 255
    color = color.clip(0, 255).round().astype(np.uint8).reshape(-1)
    scale = ((np.stack([g['scale_0'], g['scale_1'], g['scale_2']], 1) + 10) * 16).clip(0, 255).round().astype(np.uint8).reshape(-1)
    rot = np.stack([g['rot_0'], g['rot_1'], g['rot_2'], g['rot_3']], 1)  # w, x, y, z
    rot /= np.linalg.norm(rot, axis=1, keepdims=True) + 1e-12
    rot *= np.sign(rot[:, :1] + 1e-12)  # keep w >= 0 so only xyz need storing
    rot_b = (rot[:, 1:] * 127.5 + 127.5).clip(0, 255).round().astype(np.uint8).reshape(-1)
    header = struct.pack('<IIIBBBB', 0x5053474E, 2, n, 0, fractional_bits, 0, 0)
    with gzip.open(path, 'wb', compresslevel=9) as f:
        f.write(header + pos_b.tobytes() + alpha.tobytes() + color.tobytes() + scale.tobytes() + rot_b.tobytes())


def prune(g):
    # Drop Gaussians you can barely see, then keep the most visible if still over budget.
    a = 1 / (1 + np.exp(-g['opacity']))
    keep = np.where(a > 0.06)[0]
    if len(keep) > MAX_SPLATS:
        size = np.exp(g['scale_0'][keep] + g['scale_1'][keep] + g['scale_2'][keep])
        score = a[keep] * np.cbrt(size)
        keep = keep[np.argsort(-score)[:MAX_SPLATS]]
    return {k: v[keep] for k, v in g.items()}


def main(ids):
    manifest_path = os.path.join(LOCAL, 'manifest.json')
    photos = {p['id']: p for p in json.load(open(manifest_path))['photos']}
    out_dir = os.path.join(LOCAL, 'splats')
    os.makedirs(out_dir, exist_ok=True)
    index_path = os.path.join(LOCAL, 'splats.json')
    index = json.load(open(index_path)) if os.path.exists(index_path) else {'splats': []}
    done = {s['id'] for s in index['splats']}

    for pid in ids:
        if pid in done:
            print(pid, 'already done')
            continue
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(LOCAL, 'photos', pid + '.jpg')
            os.makedirs(os.path.join(tmp, 'in'))
            os.symlink(os.path.abspath(src), os.path.join(tmp, 'in', pid + '.jpg'))
            subprocess.run([os.path.join(SHARP, 'venv/bin/sharp'), 'predict', '-i', os.path.join(tmp, 'in'),
                            '-o', os.path.join(tmp, 'out'), '-c', os.path.join(SHARP, 'sharp_2572gikvuh.pt'),
                            '--device', 'mps'], check=True, capture_output=True)
            g = prune(read_ply(os.path.join(tmp, 'out', pid + '.ply')))
        dest = os.path.join(out_dir, pid + '.spz')
        write_spz(dest, g)
        p = photos[pid]
        index['splats'].append({
            'id': pid,
            'title': p['category'],
            'src': f'/local/splats/{pid}.spz',
            'thumb': p['src'],
            # SHARP uses camera axes (x right, y down, z forward); three.js is y up, z toward you.
            'rotation': [3.14159265, 0, 0],
            'kind': 'photo',
        })
        json.dump(index, open(index_path, 'w'), indent=1)
        print(pid, f"{len(g['x']):,} splats", f"{os.path.getsize(dest) / 1e6:.1f} MB", flush=True)


if __name__ == '__main__':
    main(sys.argv[1:])
