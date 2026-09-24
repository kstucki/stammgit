import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';

// Vite only clears dist/. Copy just its generated entry and assets into the
// existing publish directory. Family data and static source files stay in place.
await build();
const root = process.cwd();
await fs.cp(path.join(root, 'dist/assets/ui'), path.join(root, 'public/assets/ui'), { recursive: true });
// Publish the entry last; earlier hashed assets remain available to open pages.
await fs.copyFile(path.join(root, 'dist/index.html'), path.join(root, 'public/index.html'));
console.log('Frontend published to public/ (existing Netlify publish directory).');
