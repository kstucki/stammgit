import type { Dataset } from '../domain/person';
import { initialCenter } from './family';
export function readConnections(data: Dataset, tree: string, requested: string[], storage?: Pick<Storage, 'getItem'>, center?: string): string[] {
  const valid = (ids: unknown[]) => [...new Set(ids.filter((id): id is string => typeof id === 'string' && Object.hasOwn(data.people, id)))];
  if (requested.length) return valid(requested);
  try {
    const saved = JSON.parse(storage?.getItem(`connections:${tree}`) || 'null');
    if (Array.isArray(saved)) return valid(saved);
  } catch { /* Optional view state. */ }
  return [center || initialCenter(data, tree, storage)];
}
export function rememberConnections(tree: string, selected: string[], storage?: Pick<Storage, 'setItem'>) {
  try { storage?.setItem(`connections:${tree}`, JSON.stringify(selected)); } catch { /* URL still retains this selection. */ }
}
