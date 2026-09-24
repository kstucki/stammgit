import type { Dataset } from '../domain/person';

export function initialCenter(dataset: Dataset, tree: string, storage?: Pick<Storage, 'getItem'>): string {
  let stored: string | null = null;
  try { stored = storage?.getItem(`familyCenter:${tree}`) || null; } catch { /* Optional view persistence. */ }
  return stored && Object.hasOwn(dataset.people, stored) ? stored : dataset.meta.focusPersonId;
}

export function rememberCenter(tree: string, id: string, storage?: Pick<Storage, 'setItem'>): void {
  try { storage?.setItem(`familyCenter:${tree}`, id); } catch { /* The view remains usable. */ }
}

import { graphModes, type GraphMode } from '../domain/tree-selection';
export interface GraphState { mode: GraphMode; roots: string[] }
export function readGraphState(dataset: Dataset, tree: string, storage?: Pick<Storage, 'getItem'>): GraphState {
  const result: GraphState = { mode: 'family', roots: [] };
  try {
    const saved = JSON.parse(storage?.getItem(`graphState:${tree}`) || 'null');
    if (!saved) return result;
    if (graphModes.includes(saved.mode)) result.mode = saved.mode;
    if (Array.isArray(saved.roots)) result.roots = [...new Set<string>(saved.roots.filter((id: unknown) => typeof id === 'string' && Object.hasOwn(dataset.people, id)))];
  } catch { /* Stale or unavailable view storage must not prevent loading. */ }
  return result;
}
export function rememberGraphState(tree: string, state: GraphState, storage?: Pick<Storage, 'setItem'>): void {
  try { storage?.setItem(`graphState:${tree}`, JSON.stringify(state)); } catch { /* Optional camera persistence. */ }
}

const validZoom = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 3;
export function readZoom(tree: string, storage?: Pick<Storage, 'getItem'>, legacy?: Pick<Storage, 'getItem'>): number | undefined {
  try {
    const value = JSON.parse(storage?.getItem('graphZoom') || 'null');
    if (validZoom(value)) return value;
  } catch { /* Optional persistence. */ }
  try {
    const saved = JSON.parse(legacy?.getItem(`graphState:${tree}`) || 'null');
    const value = graphModes.includes(saved?.mode) ? saved?.scales?.[saved.mode] : undefined;
    if (validZoom(value)) return value;
  } catch { /* Invalid legacy state does not block the graph. */ }
}
export function rememberZoom(scale: number | undefined, storage?: Pick<Storage, 'setItem'>) {
  if (validZoom(scale)) try { storage?.setItem('graphZoom', JSON.stringify(scale)); } catch { /* Optional persistence. */ }
}
