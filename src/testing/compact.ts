import { buildFamGraph, layoutGraph, computeGenerations } from '../../public/assets/graph.js';
import { treeVisibility } from '../domain/tree-selection';
import { years } from '../domain/person';
import type { Dataset } from '../domain/person';
import type { ArchiveConfig } from '../domain/archive';
export interface CompactNode { id: string; type: string; persons: string[]; x: number; y: number; w: number; h: number; gen: number }
interface Laid { width: number; height: number; nodes: CompactNode[]; edges: { from: string; to: string; ring?: string; dashed?: boolean; layoutOnly?: boolean }[]; rings: { id: string; a: string; b: string; na: string; nb: string }[] }
export function compactScene(data: Dataset, config: ArchiveConfig, tree: string, mode: 'hourglass' | 'descendants', selected: string[], descendant: string | null, t: { get(key: string): string; getGenLabel(diff: string): string }) {
  const people = data.people;
  const { visible, ref, inDesc, hourglass, hgRoots } = treeVisibility(data, config, tree, mode, selected, descendant);
  const laid = layoutGraph(buildFamGraph(people, visible, {}), (node: { persons: string[] }) => {
    const lines = node.persons.map(id => `${people[id]?.name || id}${years(people[id], t.get('bornAbbr')) ? `  ${years(people[id], t.get('bornAbbr'))}` : ''}`);
    return { w: Math.min(340, Math.max(...lines.map(line => line.length), 6) * 7.6 + 48), h: lines.length * 17 + 16 };
  }, computeGenerations(people, visible, ref)) as Laid;
  const byId = new Map(laid.nodes.map(n => [n.id, n])), bottom = new Map<number, number>();
  for (const n of laid.nodes) bottom.set(n.gen, Math.max(bottom.get(n.gen) || 0, n.y + n.h));
  const rowY = (n: CompactNode, id: string) => n.y + 10 + Math.max(0, n.persons.indexOf(id)) * 17;
  const rings = laid.rings.map(r => {
    const A = byId.get(r.na)!, B = byId.get(r.nb)!, left = A.x <= B.x ? A : B, right = left === A ? B : A;
    const x1 = left.x + left.w / 2, y1 = rowY(left, left === A ? r.a : r.b), x2 = right.x - right.w / 2, y2 = rowY(right, left === A ? r.b : r.a);
    const gap = x2 - x1, x = (x1 + x2) / 2;
    if (gap <= 80) return { id: r.id, x, y: (y1 + y2) / 2, path: `M ${x1} ${y1} L ${x2} ${y2}` };
    const sag = Math.min((bottom.get(A.gen) ?? Math.max(y1, y2)) + 16, A.y + 114);
    return { id: r.id, x, y: .125 * (y1 + y2) + .75 * sag, path: `M ${x1} ${y1} C ${x1 + gap * .2} ${sag}, ${x2 - gap * .2} ${sag}, ${x2} ${y2}` };
  });
  const edges = laid.edges.filter(e => !e.layoutOnly).map(e => {
    const to = byId.get(e.to)!, ring = rings.find(r => r.id === e.ring), from = byId.get(e.from)!;
    const x1 = ring ? ring.x : from.x, y1 = ring ? ring.y + 9 : from.y + from.h, middle = (y1 + to.y) / 2;
    return { dashed: e.dashed, path: `M ${x1} ${y1} C ${x1} ${middle}, ${to.x} ${middle}, ${to.x} ${to.y}` };
  });
  const focus = laid.nodes.find(n => n.persons.includes(ref))?.gen || 0, rows = new Map<number, number>();
  for (const n of laid.nodes) if (!rows.has(n.gen) || n.y < rows.get(n.gen)!) rows.set(n.gen, n.y);
  const labels = [...rows].map(([gen, y]) => ({ y: y + 16, label: gen === focus && inDesc ? t.get('descRootLabel') : gen === focus && hourglass && ref !== data.meta.focusPersonId ? t.get('genCenter') : t.getGenLabel(String(gen - focus)) }));
  return { ...laid, edges, rings, labels, ref, inDesc, hourglass, hgRoots };
}
