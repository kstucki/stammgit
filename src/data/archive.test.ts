import { describe, expect, it } from 'vitest';
import { loadArchive, resolveTree, roleFromCookie } from './archive';
import { availableViews } from '../domain/archive';
import type { TreeIndex } from '../domain/archive';

const index: TreeIndex = { defaultTree: 'demo', trees: [{ id: 'demo', title: 'Demo', people: 4 }] };
const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });
const draft = JSON.stringify({ meta: { title: 'New tree' }, people: { a: {}, b: {} } });

describe('read-only landing page selection', () => {
  it('uses the published default without rewriting browser storage', () => {
    expect(resolveTree(index, storage({}))).toEqual({ tree: index.trees[0], hasDraft: false });
  });
  it('reflects a draft without replacing the published dataset', () => {
    expect(resolveTree(index, storage({ 'familyTreeDraft:demo': draft })))
      .toEqual({ tree: { id: 'demo', title: 'Demo', people: 2 }, hasDraft: true });
    expect(index.trees[0].people).toBe(4);
  });
  it('keeps a new local-only dataset selectable across document navigation', () => {
    expect(resolveTree(index, storage({ activeTree: 'new', 'familyTreeDraft:new': draft })))
      .toEqual({ tree: { id: 'new', title: 'New tree', people: 2 }, hasDraft: true });
  });
  it('falls back from stale selections, malformed drafts and unavailable storage', () => {
    expect(resolveTree(index, storage({ activeTree: 'gone', 'familyTreeDraft:gone': '{' })).tree.id).toBe('demo');
    expect(resolveTree(index, { getItem() { throw new Error('Storage disabled'); } }).hasDraft).toBe(false);
    expect(() => resolveTree({ trees: [], defaultTree: 'missing' })).toThrow('Default dataset');
  });
  it('recognizes the original draft key without migrating or deleting it', () => {
    const family = { defaultTree: 'family', trees: [{ id: 'family', title: 'Family', people: 4 }] };
    expect(resolveTree(family, storage({ familyTreeDraft: draft })).hasDraft).toBe(true);
  });
  it('does not confuse cookie substrings with an admin role', () => {
    expect(roleFromCookie('family_tree_role=admin; x=y')).toBe('admin');
    expect(roleFromCookie('x_family_tree_role=admin')).toBe('user');
    expect(roleFromCookie('family_tree_role=administrator')).toBe('user');
  });
});

describe('archive loading and navigation', () => {
  const fetcher = (chronicleStatus = 200): typeof fetch => async input => {
    const url = String(input);
    if (url === '/data/config.json') return Response.json({ title: 'Demo', language: 'en' });
    if (url === '/data/trees/index.json') return Response.json(index);
    return Response.json({ chapters: [{ file: 'intro.md' }] }, { status: chronicleStatus });
  };
  it('offers existing content and role-appropriate actions', async () => {
    const archive = await loadArchive({ fetcher: fetcher(), cookie: 'family_tree_role=admin' });
    expect(availableViews(archive)).toEqual(['chronicle', 'sources', 'admin']);
    expect(availableViews({ ...archive, role: 'user' })).toEqual(['chronicle', 'sources']);
  });
  it('distinguishes absent chronicles from failed requests', async () => {
    const archive = await loadArchive({ fetcher: fetcher(404) });
    expect(availableViews(archive)).toEqual(['sources']);
    await expect(loadArchive({ fetcher: fetcher(500) })).rejects.toThrow('500');
  });
  it('rejects malformed core metadata instead of presenting a usable-looking page', async () => {
    await expect(loadArchive({ fetcher: async () => Response.json({}) })).rejects.toThrow('Invalid archive');
  });
  it('forwards cancellation to requests', async () => {
    const controller = new AbortController();
    controller.abort();
    const cancelled: typeof fetch = async (_input, options) => {
      options?.signal?.throwIfAborted();
      return Response.json({});
    };
    await expect(loadArchive({ fetcher: cancelled, signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
