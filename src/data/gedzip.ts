import JSZip from 'jszip';
import { exportGedcom7, importGedcom } from '../../public/assets/gedcom.js';
import { sourceUrl } from './family';
import { sanitizeFilename } from '../../netlify/shared/upload-rules.mjs';
import type { Dataset } from '../domain/person';

export type GedcomLanguage = 'de' | 'en' | 'pt';
export class GedzipFileError extends Error {
  constructor(public fileError: 'Missing' | 'Conflict' | 'Unsupported' | 'Ambiguous', public path: string) {
    super(`GEDZIP file ${fileError.toLowerCase()}: ${path}`);
  }
}
export interface GedzipMedia { path: string; blob: Blob; variantPath?: string }

/** GEDZIP: gedcom.ged plus every cited local document and portrait. */
export async function buildGedzip(data: Dataset, options: { language: GedcomLanguage; includeLiving: boolean; sourceFiles: ReadonlySet<string>; assets: ReadonlyMap<string, string> }, progress: (done: number, total: number) => void) {
  const { text, files } = exportGedcom7(data, { language: options.language, includeLiving: options.includeLiving, sourceFiles: new Set(options.sourceFiles) });
  const zip = new JSZip();
  zip.file('gedcom.ged', text);
  let done = 0; progress(done, files.length);
  for (const file of files) {
    const response = await fetch(sourceUrl(file.url, options.assets) || file.url);
    if (!response.ok) throw new Error(`${file.url}: ${response.status}`);
    zip.file(file.path, await response.arrayBuffer(), { binary: true });
    progress(++done, files.length);
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
}

/** Read and validate all package media before changing the workspace. */
export async function readGedzip(file: Blob) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entry = zip.file('gedcom.ged') || zip.file(/\.ged$/i)[0];
  if (!entry) throw new GedzipFileError('Missing', 'gedcom.ged');
  const parsed = importGedcom(await entry.async('text'));
  const media: GedzipMedia[] = [];
  const aliases = new Map<string, string>();
  for (const path of parsed.mediaFiles || []) {
    if (!/^(sources|photos)\//.test(path) || !/^(sources\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(pdf|png|jpe?g)|photos\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.(png|jpe?g))$/i.test(path))
      throw new GedzipFileError('Unsupported', path);
    const item = zip.file(path);
    if (!item) throw new GedzipFileError('Missing', path);
    // A single-language archive may contain only a translated PDF. Install it
    // as the imported document's original, so every UI language can open it.
    const canonical = path.replace(/\.(en|pt)\.pdf$/i, '.pdf');
    const target = path.startsWith('sources/') && !zip.file(canonical) ? canonical : path;
    if (media.some(item => item.path === target)) throw new GedzipFileError('Ambiguous', target);
    if (target !== path) aliases.set(`/${path}`, `/${target}`);
    media.push({ path: target, ...(target !== path ? { variantPath: path } : {}), blob: new Blob([await item.async('arraybuffer')], { type: /\.pdf$/i.test(path) ? 'application/pdf' : /\.png$/i.test(path) ? 'image/png' : 'image/jpeg' }) });
  }
  for (const person of Object.values(parsed.people) as Dataset['people'][string][]) {
    for (const source of [...(person.sources || []), ...Object.values(person.parentDetails || {}).flatMap(detail => detail.sources || [])]) {
      const [base] = source.url.split(/[?#]/);
      if (aliases.has(base)) source.url = aliases.get(base)! + source.url.slice(base.length);
    }
  }
  return { parsed, media };
}

/** Same path is reusable only for the same bytes. Check everything before staging. */
export async function newGedzipMedia(media: GedzipMedia[], assets: ReadonlyMap<string, string>, fetcher: typeof fetch = fetch) {
  const fresh: GedzipMedia[] = [];
  const same = async (response: Response, blob: Blob) => {
    const existing = new Uint8Array(await response.arrayBuffer());
    const incoming = new Uint8Array(await blob.arrayBuffer());
    return existing.length === incoming.length && existing.every((byte, index) => byte === incoming[index]);
  };
  const read = async (url: string) => {
    const response = await fetcher(sourceUrl(url, assets) || url);
    if (!response.ok && response.status !== 404) throw new Error(`${url}: ${response.status}`);
    return response;
  };
  for (const item of media) {
    const url = `/${item.path}`;
    const response = await read(url);
    // Reimporting our translated export can reuse the published translation
    // and original together, without replacing the original with translated bytes.
    let matchingVariant = false;
    if (item.variantPath) {
      const variant = await read(`/${item.variantPath}`);
      if (variant.ok) {
        if (!await same(variant, item.blob)) throw new GedzipFileError('Conflict', `/${item.variantPath}`);
        matchingVariant = true;
      }
    }
    if (response.status === 404) {
      // The upload endpoint normalizes filenames. Never stage a name that would
      // be published at a different URL than the imported reference.
      if (item.path.split('/')[1] !== sanitizeFilename(item.path.split('/')[1]))
        throw new GedzipFileError('Unsupported', item.path);
      fresh.push(item); continue;
    }
    if (!matchingVariant && !await same(response, item.blob)) throw new GedzipFileError('Conflict', url);
  }
  return fresh;
}
