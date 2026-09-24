import type { ArchiveConfig, ArchiveSnapshot, Role, TreeIndex, TreeSummary } from '../domain/archive';

type StorageReader = Pick<Storage, 'getItem'>;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function read(storage: StorageReader | undefined, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function resolveTree(index: TreeIndex, storage?: StorageReader): { tree: TreeSummary; hasDraft: boolean } {
  const wanted = read(storage, 'activeTree') || index.defaultTree;
  const draftFor = (id: string): TreeSummary | null => {
    const raw = read(storage, `familyTreeDraft:${id}`)
      || (id === 'family' ? read(storage, 'familyTreeDraft') : null);
    if (!raw) return null;
    try {
      const draft: unknown = JSON.parse(raw);
      if (!object(draft) || !object(draft.people)) return null;
      return {
        id,
        title: object(draft.meta) && typeof draft.meta.title === 'string' ? draft.meta.title : id,
        people: Object.keys(draft.people).length,
      };
    } catch { return null; }
  };
  const published = index.trees.find(tree => tree.id === wanted);
  const draft = draftFor(wanted);
  if (published) return { tree: { ...published, people: draft?.people ?? published.people }, hasDraft: !!draft };
  if (draft && /^[a-z0-9_-]+$/.test(wanted)) return { tree: draft, hasDraft: true };
  const fallback = index.trees.find(tree => tree.id === index.defaultTree);
  if (!fallback) throw new Error('Default dataset is missing.');
  const fallbackDraft = draftFor(fallback.id);
  return { tree: { ...fallback, people: fallbackDraft?.people ?? fallback.people }, hasDraft: !!fallbackDraft };
}

export function roleFromCookie(cookie: string): Role {
  return /(?:^|;\s*)family_tree_role=admin(?:;|$)/.test(cookie) ? 'admin' : 'user';
}

export async function loadArchive({
  fetcher = fetch,
  storage,
  cookie = '',
  signal,
}: {
  fetcher?: typeof fetch;
  storage?: StorageReader;
  cookie?: string;
  signal?: AbortSignal;
} = {}): Promise<ArchiveSnapshot> {
  const get = async (url: string): Promise<unknown> => {
    const response = await fetcher(url, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`Loading ${url} failed (${response.status}).`);
    return response.json();
  };
  const [config, index] = await Promise.all([get('/data/config.json'), get('/data/trees/index.json')]);
  if (!object(config) || typeof config.title !== 'string'
    || !object(index) || typeof index.defaultTree !== 'string' || !Array.isArray(index.trees)
    || !index.trees.every(tree => object(tree) && typeof tree.id === 'string'
      && /^[a-z0-9_-]+$/.test(tree.id) && typeof tree.title === 'string' && typeof tree.people === 'number')) {
    throw new Error('Invalid archive configuration or dataset index.');
  }
  const selection = resolveTree(index as unknown as TreeIndex, storage);
  const chronicleResponse = await fetcher(`/data/chronicle-${selection.tree.id}.json`, { cache: 'no-store', signal });
  let hasChronicle = false;
  let chronicle: import('../domain/person').ChronicleIndex | null = null;
  if (chronicleResponse.ok) {
    chronicle = await chronicleResponse.json();
    hasChronicle = object(chronicle) && Array.isArray(chronicle.chapters) && chronicle.chapters.length > 0;
  } else if (chronicleResponse.status !== 404) {
    throw new Error(`Loading the chronicle index failed (${chronicleResponse.status}).`);
  }
  return { config: config as unknown as ArchiveConfig, ...selection, hasChronicle, index: index as unknown as TreeIndex, chronicle, role: roleFromCookie(cookie) };
}
