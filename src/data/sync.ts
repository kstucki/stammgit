import * as pending from '../../public/assets/pending.js';
import type { Dataset } from '../domain/person';
export const API = '/.netlify/functions';
export function uploadTarget(name: string) {
  if (name.startsWith('photos/')) return { filename: name.slice(7), kind: 'photo' };
  if (name.startsWith('chronicle/')) { const [, tree, ...rest] = name.split('/'); return { filename: rest.join('/'), kind: 'chronicle', tree }; }
  return { filename: name, kind: 'source' };
}
export async function jsonRequest(path: string, data: unknown, fetcher = fetch) {
  const response = await fetcher(`${API}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `${path}: ${response.status}`);
  return result;
}
async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = ''; for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}
// Deliberately preserve the existing upload -> YAML -> deletion transaction order.
export async function syncArchive(input: { data: Dataset; tree: string; create: boolean; baseHash: string | null },
  progress: (phase: string, values?: Record<string, string | number>) => void,
  { fetcher = fetch, files = pending } = {}) {
  const uploads = await files.pendingListFiles(input.tree) as string[];
  for (const [i, name] of uploads.entries()) {
    progress('syncUploading', { i: i + 1, n: uploads.length });
    const entry = await files.pendingGetFile(name, input.tree);
    if (!entry) continue;
    await jsonRequest('upload-source', { ...uploadTarget(name), contentBase64: await base64(new Blob([entry.blob], { type: entry.type })) }, fetcher);
    await files.pendingRemoveFile(name, input.tree);
  }
  progress('saving');
  const result = await jsonRequest('save-family', input, fetcher);
  const warnings: string[] = [];
  for (const name of await files.pendingListDeletions(input.tree) as string[]) {
    progress('syncDeleting', { name });
    try {
      const response = await fetcher(`${API}/delete-source`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(uploadTarget(name)) });
      if (!response.ok && response.status !== 404) throw new Error((await response.json().catch(() => ({}))).error || String(response.status));
      await files.pendingClearDeletion(name, input.tree);
    } catch (error) { warnings.push(`${name}: ${error instanceof Error ? error.message : error}`); }
  }
  return { ...result, deleteWarnings: warnings };
}
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export const downloadText = (filename: string, text: string, type = 'text/plain') => downloadBlob(filename, new Blob([text], { type }));
