import type { Dataset } from './person';
import { parentType } from '../../public/assets/relationships.js';
import { connectionEdges } from './connections';

interface Count { total: bigint; adopted: bigint }
export interface DirectLines { generations: Map<number, bigint>; adopted: bigint }

// Count paths on the ancestry DAG without enumerating them. Unknown parent
// types retain the engine's semantics; adoption is counted and marked explicitly.
// A cycle invalidates memoised counts, so callers keep their ordinary explanation.
export function directLines(data: Dataset, descendant: string, ancestor: string): DirectLines | null {
  if (!data.people[descendant] || !data.people[ancestor]) return null;
  const parents = new Map<string, { id: string; adopted: boolean }[]>();
  for (const edge of connectionEdges(data)) {
    if (edge.kind !== 'parent') continue;
    const type = parentType(data.people, edge.a, edge.b);
    if (['guardian', 'other'].includes(type)) continue;
    const entries = parents.get(edge.b) || [];
    entries.push({ id: edge.a, adopted: type === 'adoptive' });
    parents.set(edge.b, entries);
  }
  const memo = new Map<string, Map<number, Count>>(), active = new Set<string>();
  let cyclic = false;
  const count = (id: string): Map<number, Count> => {
    if (id === ancestor) return new Map([[0, { total: 1n, adopted: 0n }]]);
    if (memo.has(id)) return memo.get(id)!;
    if (active.has(id)) { cyclic = true; return new Map(); }
    active.add(id);
    const lines = new Map<number, Count>();
    for (const parent of parents.get(id) || []) {
      for (const [depth, n] of count(parent.id)) {
        const previous = lines.get(depth + 1) || { total: 0n, adopted: 0n };
        lines.set(depth + 1, { total: previous.total + n.total,
          adopted: previous.adopted + (parent.adopted ? n.total : n.adopted) });
      }
    }
    active.delete(id); memo.set(id, lines);
    return lines;
  };
  const result = count(descendant);
  return cyclic ? null : {
    generations: new Map([...result].map(([depth, n]) => [depth, n.total])),
    adopted: [...result.values()].reduce((sum, n) => sum + n.adopted, 0n),
  };
}
