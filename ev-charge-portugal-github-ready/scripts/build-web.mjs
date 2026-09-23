import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const assets = ['index.html', 'manifest.webmanifest', 'service-worker.js', 'icon.svg'];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await Promise.all(assets.map((asset) => cp(resolve(root, asset), resolve(dist, asset))));
console.log('Web bundle created in dist/.');
