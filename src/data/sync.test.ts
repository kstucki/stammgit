import { describe, expect, it } from 'vitest';
import { syncArchive, uploadTarget } from './sync';
import * as pending from '../../public/assets/pending.js';
const input = { tree: 'demo', create: false, baseHash: 'initial', data: { meta: { focusPersonId: 'a' }, people: { a: { name: 'A' } } } };
function harness(fail = '') {
  const events: string[] = [], uploads = new Map([['test.pdf', new Blob(['PDF'])], ['photos/a.jpg', new Blob(['PHOTO'])]]), deletions = new Set(['old.pdf']);
  const files = {
    pendingListFiles: async () => [...uploads.keys()],
    pendingGetFile: async (name: string) => ({ blob: uploads.get(name), type: '' }),
    pendingRemoveFile: async (name: string) => { events.push(`removed:${name}`); uploads.delete(name); },
    pendingListDeletions: async () => [...deletions],
    pendingClearDeletion: async (name: string) => { events.push(`deleted:${name}`); deletions.delete(name); },
  } as unknown as typeof pending;
  const fetcher: typeof fetch = async (url, options) => {
    const endpoint = String(url).split('/').pop()!, body = JSON.parse(String(options?.body));
    events.push(`${endpoint}:${body.filename || body.tree}`);
    if (endpoint === fail) return Response.json({ error: 'rejected' }, { status: 409 });
    if (endpoint === 'upload-source') expect(atob(body.contentBase64)).toBe(body.kind === 'photo' ? 'PHOTO' : 'PDF');
    if (endpoint === 'save-family') expect(body).toEqual(input);
    return Response.json({ ok: true, branch: 'fixture-save', contentHash: 'saved' });
  };
  return { events, uploads, deletions, files, fetcher };
}
describe('existing save transaction', () => {
  it('uploads before YAML, deletes only after YAML acceptance, and reports the actual branch', async () => {
    const h = harness(); const result = await syncArchive(input, () => {}, h);
    expect(h.events).toEqual(['upload-source:test.pdf', 'removed:test.pdf', 'upload-source:a.jpg', 'removed:photos/a.jpg', 'save-family:demo', 'delete-source:old.pdf', 'deleted:old.pdf']);
    expect(result).toMatchObject({ branch: 'fixture-save', contentHash: 'saved', deleteWarnings: [] });
  });
  it('keeps rejected uploads pending and never proceeds to YAML or deletion', async () => {
    const h = harness('upload-source'); await expect(syncArchive(input, () => {}, h)).rejects.toThrow('rejected');
    expect(h.events).toEqual(['upload-source:test.pdf']); expect(h.uploads.size).toBe(2); expect(h.deletions.size).toBe(1);
  });
  it('a stale YAML save cannot delete an existing document', async () => {
    const h = harness('save-family'); await expect(syncArchive(input, () => {}, h)).rejects.toThrow('rejected');
    expect(h.deletions.size).toBe(1); expect(h.events.some(event => event.startsWith('delete-source'))).toBe(false);
  });
  it('keeps a failed deletion queued and reports its partial failure', async () => {
    const h = harness('delete-source'); const result = await syncArchive(input, () => {}, h);
    expect(result.deleteWarnings).toEqual(['old.pdf: rejected']); expect(h.deletions.size).toBe(1);
  });
  it('addresses chapter indexes and portraits with the existing upload API', () => {
    expect(uploadTarget('chronicle/demo/index.yaml')).toEqual({ filename: 'index.yaml', kind: 'chronicle', tree: 'demo' });
    expect(uploadTarget('photos/a.jpg')).toEqual({ filename: 'a.jpg', kind: 'photo' });
    expect(uploadTarget('test.pdf')).toEqual({ filename: 'test.pdf', kind: 'source' });
  });
});

it('passes the active dataset to every queue operation', async () => {
  const h = harness();
  const scoped = { ...h.files,
    pendingListFiles: async (tree = '') => { expect(tree).toBe('demo'); return ['test.pdf']; },
    pendingGetFile: async (name: string, tree = '') => { expect(tree).toBe('demo'); return h.files.pendingGetFile(name); },
    pendingRemoveFile: async (name: string, tree = '') => { expect(tree).toBe('demo'); return h.files.pendingRemoveFile(name); },
    pendingListDeletions: async (tree = '') => { expect(tree).toBe('demo'); return ['old.pdf']; },
    pendingClearDeletion: async (name: string, tree = '') => { expect(tree).toBe('demo'); return h.files.pendingClearDeletion(name); },
  };
  await syncArchive(input, () => {}, { ...h, files: scoped });
});
