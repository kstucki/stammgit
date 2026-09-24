import { validateDataset } from '../../netlify/shared/validate.mjs';
import type { ArchiveSnapshot } from '../domain/archive';
import type { ChronicleIndex, Dataset } from '../domain/person';

export interface FamilySession {
  dataset: Dataset;
  hasDraft: boolean;
  chronicle: ChronicleIndex | null;
  assets: ReadonlyMap<string, string>;
}

export async function loadFamilySession(archive: ArchiveSnapshot, {
  fetcher = fetch, storage, signal,
}: { fetcher?: typeof fetch; storage?: Pick<Storage, 'getItem'>; signal?: AbortSignal } = {}): Promise<FamilySession> {
  const tree = archive.tree.id;
  let draft: string | null = null;
  try {
    draft = storage?.getItem(`familyTreeDraft:${tree}`)
      || (tree === 'family' ? storage?.getItem('familyTreeDraft') : null) || null;
  } catch { /* Storage may be unavailable; the published dataset is still readable. */ }
  let data: unknown;
  if (draft) data = JSON.parse(draft);
  else {
    const response = await fetcher(`/data/trees/${tree}.json`, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`Dataset request failed (${response.status}).`);
    data = await response.json();
  }
  const problems = validateDataset(data);
  if (problems.length) throw new Error(problems.join('\n'));
  let chronicle = archive.chronicle;
  if (chronicle === undefined) {
    const response = await fetcher(`/data/chronicle-${tree}.json`, { cache: 'no-store', signal });
    if (!response.ok && response.status !== 404) throw new Error('Chronicle request failed.');
    chronicle = response.ok ? await response.json() as ChronicleIndex : null;
  }
  // Workspace alone owns pending-file reads and object URL lifetimes.
  const assets = new Map<string, string>();
  signal?.throwIfAborted();
  return { dataset: data as Dataset, hasDraft: !!draft, chronicle, assets };
}

export function sourceUrl(url: string, assets: ReadonlyMap<string, string>): string | undefined {
  if (assets.has(url)) return assets.get(url);
  try {
    if (['http:', 'https:'].includes(new URL(url, 'https://archive.invalid').protocol)) return url;
  } catch { /* Invalid source URLs are displayed as text. */ }
  return undefined;
}
