#!/usr/bin/env node
// Downloads the Splat Worlds scenes into public/splats/ (git-ignored) so demos
// never depend on the network. The app falls back to the remote URL for any file
// that is missing. Usage: npm run splats [-- --force] [-- id ...]
import { readFile, mkdir, rename, stat, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public', 'splats');
const { scenes } = JSON.parse(await readFile(path.join(root, 'src', 'demos', 'splatScenes.json'), 'utf8'));

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const list = only.length ? scenes.filter((s) => only.includes(s.id)) : scenes;

const exists = (p) => stat(p).then((s) => s.size > 0, () => false);
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';

await mkdir(outDir, { recursive: true });
let total = 0, failed = 0;
for (const s of list) {
    const dest = path.join(outDir, s.file);
    if (!force && await exists(dest)) {
        console.log(`  ✓ ${s.name.padEnd(16)} already here`);
        continue;
    }
    const part = dest + '.part';
    try {
        const res = await fetch(s.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const size = Number(res.headers.get('content-length')) || 0;
        let got = 0, lastLog = 0;
        const body = Readable.fromWeb(res.body);
        body.on('data', (chunk) => {
            got += chunk.length;
            if (size && process.stdout.isTTY && Date.now() - lastLog > 200) {
                lastLog = Date.now();
                process.stdout.write(`\r  ↓ ${s.name.padEnd(16)} ${Math.round((got / size) * 100)}%`);
            }
        });
        await pipeline(body, createWriteStream(part));
        await rename(part, dest); // only complete files ever get the real name
        total += got;
        if (process.stdout.isTTY) process.stdout.write('\r');
        console.log(`  ✓ ${s.name.padEnd(16)} ${mb(got)}`);
    } catch (e) {
        failed++;
        await unlink(part).catch(() => {});
        console.error(`  ✗ ${s.name.padEnd(16)} ${e.message}`);
    }
}
console.log(`\nDone: ${mb(total)} downloaded into public/splats/${failed ? `, ${failed} failed (those load from the web instead)` : ''}`);
process.exitCode = failed ? 1 : 0;
