import { describe, expect, it } from 'vitest';
import { loadFamilySession, sourceUrl } from './family';
import type { ArchiveSnapshot } from '../domain/archive';

const archive: ArchiveSnapshot = { config: { title: 'Test' }, tree: { id: 'demo', title: 'Test', people: 1 }, hasDraft: false, hasChronicle: false, role: 'user' };
const dataset = { meta: { focusPersonId: 'a' }, people: { a: { name: 'Published' } } };
const fetcher: typeof fetch = async input => String(input).includes('chronicle-')
  ? new Response('', { status: 404 }) : Response.json(dataset);

describe('shared draft data in the family view', () => {
  it('loads the published data when browser storage is unavailable', async () => {
    const session = await loadFamilySession(archive, { fetcher, storage: { getItem() { throw new Error('blocked'); } } });
    expect(session.dataset).toEqual(dataset);
    expect(session.hasDraft).toBe(false);
  });
  it('reads the existing full draft, including locally created people, without writing browser state', async () => {
    const draft = { meta: { focusPersonId: 'b' }, people: { b: { name: 'Draft person', notes: ['Local note'] } } };
    const session = await loadFamilySession(archive, { fetcher, storage: { getItem: () => JSON.stringify(draft) } });
    expect(session.dataset).toEqual(draft);
    expect(session.hasDraft).toBe(true);
  });
  it('rejects corrupt drafts without silently replacing their visible data', async () => {
    await expect(loadFamilySession(archive, { fetcher, storage: { getItem: () => '{' } })).rejects.toThrow();
    await expect(loadFamilySession(archive, { fetcher, storage: { getItem: () => JSON.stringify({ people: {} }) } })).rejects.toThrow('focusPersonId');
  });
  it('reports a failed data request', async () => {
    await expect(loadFamilySession(archive, { fetcher: async () => new Response('', { status: 500 }) })).rejects.toThrow('500');
  });
  it('uses prepared local blobs and preserves valid source paths, but never javascript links', () => {
    const assets = new Map([['/photos/a.jpg', 'blob:local-photo']]);
    expect(sourceUrl('/photos/a.jpg', assets)).toBe('blob:local-photo');
    expect(sourceUrl('/sources/test.pdf', assets)).toBe('/sources/test.pdf');
    expect(sourceUrl('https://example.org/source', assets)).toBe('https://example.org/source');
    expect(sourceUrl('javascript:alert(1)', assets)).toBeUndefined();
  });
});

it('reuses the already fetched chronicle index without a second HTTP request', async () => {
  const paths: string[] = [];
  const session = await loadFamilySession({ ...archive, chronicle: { chapters: [] } }, {
    fetcher: async input => { paths.push(String(input)); return Response.json(dataset); },
  });
  expect(paths).toEqual(['/data/trees/demo.json']);
  expect(session.chronicle).toEqual({ chapters: [] });
});
