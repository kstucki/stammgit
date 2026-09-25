// Explicit local maintenance command. Poppler is required; never part of build.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root = process.cwd(), publicDir = path.join(root, 'public');
const urls = new Set();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.md')) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(/^\[\[s:(\/sources\/[^|\]\n]+\.pdf)(?:\|[^\]\n]+)?\]\](?:\s+–\s+.*)?\s*$/gm)) urls.add(match[1]);
    }
  }
}
walk(path.join(publicDir, 'chronicle'));
const manifest = {};
fs.mkdirSync(path.join(publicDir, 'sources/thumbnails'), { recursive: true });
for (const url of [...urls].sort()) {
  const file = path.resolve(publicDir, '.' + url);
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file)) { console.warn(`Missing PDF: ${url}`); continue; }
  const thumb = `/sources/thumbnails/${path.basename(url, '.pdf')}.jpg`;
  execFileSync('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', '360', '-jpeg', '-jpegopt', 'quality=80', file, path.join(publicDir, thumb.slice(1, -4))], { stdio: 'inherit' });
  manifest[url] = thumb;
}
fs.writeFileSync(path.join(publicDir, 'assets/source-thumbnails.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${Object.keys(manifest).length} thumbnails generated.`);
