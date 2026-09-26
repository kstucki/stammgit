import { layoutGraph } from './graph/layout';
import type { LayoutGraph } from './graph/types';
import { layoutGraph as legacyLayoutGraph } from '../../public/assets/graph.js';
import type { FamilySlice } from './family';

export type LayoutEngine = 'legacy' | 'typescript';

export const CARD_WIDTH = 228;
export const CARD_HEIGHT = 174;
const ROW = 310;
// Keep the external 44px expansion controls and their 8px gap inside the canvas.
const PAD = 60;
export interface Point { x: number; y: number }
export interface FamilyOrder { width: number; nodes: { id: string; x: number; gen: number }[] }
export interface FamilyLayout {
  width: number; height: number;
  people: Map<string, Point>;
  anchors: Map<string, Point>;
  heights: ReadonlyMap<string, number>;
}

// The small selected neighborhood supplies generations, not the whole tree.
function familyGenerations(family: FamilySlice): Map<string, number> {
  const levels = new Map<string, number>([[family.center, 0]]);
  family.parents.forEach(id => { if (!levels.has(id)) levels.set(id, -1); });
  family.children.forEach(id => { if (!levels.has(id)) levels.set(id, 1); });
  [...family.partners, ...family.siblings.map(sibling => sibling.id)].forEach(id => { if (!levels.has(id)) levels.set(id, 0); });
  for (const group of family.groups) {
    const childLevels = group.children.map(id => levels.get(id) ?? 0);
    for (const id of group.adults) {
      if (!levels.has(id)) levels.set(id, childLevels.length ? Math.min(...childLevels) - 1 : 0);
    }
  }
  return levels;
}

// Solve parent -> child = +1 within each ancestry component. Partnerships
// never merge these constraints. Only inconsistent ancestry needs longest paths.
export function consistentGenerations(family: FamilySlice, preferred: Map<string, number>): Map<string, number> {
  const adjacent = new Map(family.people.map(id => [id, [] as { id: string; delta: number }[]]));
  const children = new Map(family.people.map(id => [id, new Set<string>()]));
  const parents = new Map(family.people.map(id => [id, new Set<string>()]));
  for (const { parent, child } of family.generationParents) {
    if (!adjacent.has(parent) || !adjacent.has(child) || children.get(parent)!.has(child)) continue;
    adjacent.get(parent)!.push({ id: child, delta: 1 });
    adjacent.get(child)!.push({ id: parent, delta: -1 });
    children.get(parent)!.add(child); parents.get(child)!.add(parent);
  }
  const rows = new Map<string, number>(), owner = new Map<string, number>(), components: string[][] = [];
  for (const root of family.people) {
    if (owner.has(root)) continue;
    const ids = [root], component = components.length;
    components.push(ids); owner.set(root, component); rows.set(root, 0);
    let consistent = true;
    for (let i = 0; i < ids.length; i++) for (const next of adjacent.get(ids[i])!) {
      const level = rows.get(ids[i])! + next.delta;
      if (!owner.has(next.id)) { owner.set(next.id, component); rows.set(next.id, level); ids.push(next.id); }
      else if (rows.get(next.id) !== level) consistent = false;
    }
    if (!consistent) {
      const degree = new Map(ids.map(id => [id, parents.get(id)!.size]));
      const queue = ids.filter(id => degree.get(id) === 0);
      ids.forEach(id => rows.set(id, 0));
      for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i])!) {
        rows.set(child, Math.max(rows.get(child)!, rows.get(queue[i])! + 1));
        degree.set(child, degree.get(child)! - 1);
        if (!degree.get(child)) queue.push(child);
      }
      // Invalid ancestry cycles cannot be layered. Keep all cards finite;
      // never loop, discard a person or change the stored relationships.
    }
    const anchor = ids.includes(family.center) ? family.center : root;
    const offset = (preferred.get(anchor) ?? 0) - rows.get(anchor)!;
    ids.forEach(id => rows.set(id, rows.get(id)! + offset));
  }
  // A partner without visible ancestry may join an established partner's row,
  // but only by translating a separate component (preserving every parent step).
  const fixed = new Set<number>();
  for (const group of family.groups) if (group.partnership) for (const id of group.adults) {
    if (parents.get(id)!.size) fixed.add(owner.get(id)!);
  }
  if (!fixed.size) fixed.add(owner.get(family.center)!);
  const links = family.groups.filter(group => group.partnership).flatMap(group =>
    group.adults.flatMap(a => group.adults.filter(b => b !== a).map(b => [a, b])));
  const align = () => {
    let changed = false;
    for (const [a, b] of links) {
      const source = owner.get(a)!, target = owner.get(b)!;
      if (!fixed.has(source) || fixed.has(target) || parents.get(b)!.size) continue;
      const offset = rows.get(a)! - rows.get(b)!;
      components[target].forEach(id => rows.set(id, rows.get(id)! + offset));
      fixed.add(target); changed = true;
    }
    return changed;
  };
  while (align()) { /* Propagate once per independent ancestry component. */ }
  for (let component = 0; component < components.length; component++) {
    if (!fixed.has(component)) { fixed.add(component); while (align()) { /* Root-only partner groups. */ } }
  }
  return rows;
}

// Reuse the existing crossing minimization, ring adjacency and compaction.
// Never call buildFamGraph: every person stays a separate card, and a parent
// family is independent of the legacy first-partner box selection.
export function orderFamily(
  family: FamilySlice,
  generations = familyGenerations(family),
  engine: LayoutEngine = 'typescript',
): FamilyOrder {
  const graph: LayoutGraph = {
    nodes: family.people.map(id => ({ id, type: 'single', persons: [id] })),
    edges: family.groups.flatMap(group => group.children.flatMap(child =>
      group.adults.filter(parent => parent !== child).map(parent => ({ from: parent, to: child, dashed: false })))),
    // These are geometric links; a co-parent family does not imply marriage.
    rings: family.groups.filter(group => group.adults.length === 2).map(group => ({
      id: group.id, a: group.adults[0], b: group.adults[1], na: group.adults[0], nb: group.adults[1],
    })),
  };
  const levels = consistentGenerations(family, generations);
  const measure = () => ({ w: CARD_WIDTH, h: CARD_HEIGHT });
  const { width, nodes } = engine === 'legacy' ? legacyLayoutGraph(graph, measure, levels) : layoutGraph(graph, measure, levels, {
    siblingGroups: family.groups.map(group => group.children),
    partners: family.groups.filter(group => group.partnership && group.adults.length === 2)
      .map(group => [group.adults[0], group.adults[1]] as const),
  });
  return { width, nodes };
}

export function layoutFamily(family: FamilySlice, heights: ReadonlyMap<string, number> = new Map(), result = orderFamily(family)): FamilyLayout {
  const height = (id: string) => Math.max(CARD_HEIGHT, heights.get(id) || 0);
  const nodes = result.nodes as { id: string; x: number; gen: number }[];
  const people = new Map<string, Point>();
  // Give each family bridge a lane beneath its adults; reserve enough vertical
  // space for those lanes and mixed-type annotations before the next card row.
  const groupsPerRow = new Map<number, number>();
  const generation = new Map(nodes.map(node => [node.id, node.gen]));
  const rowHeights = new Map<number, number>();
  for (const node of nodes) rowHeights.set(node.gen, Math.max(rowHeights.get(node.gen) || 0, height(node.id)));
  for (const group of family.groups) {
    const gen = Math.max(...group.adults.map(id => generation.get(id)!));
    if (group.adults.length > 1) groupsPerRow.set(gen, (groupsPerRow.get(gen) || 0) + 1);
  }
  const top = new Map<number, number>([[0, PAD]]);
  const maxGen = Math.max(...nodes.map(node => node.gen));
  for (let gen = 0; gen < maxGen; gen++) {
    top.set(gen + 1, top.get(gen)! + Math.max(ROW, (rowHeights.get(gen) || CARD_HEIGHT) + 32 + (groupsPerRow.get(gen) || 0) * 16 + 80));
  }
  for (const node of nodes) people.set(node.id, { x: node.x - CARD_WIDTH / 2 + PAD - 20, y: top.get(node.gen)! });
  const anchors = new Map<string, Point>();
  const lanes = new Map<number, number>();
  for (const group of family.groups) {
    const adults = group.adults.map(id => people.get(id)!);
    const x = adults.reduce((sum, point) => sum + point.x + CARD_WIDTH / 2, 0) / adults.length;
    const floor = Math.max(...group.adults.map(id => people.get(id)!.y + height(id)));
    const row = Math.max(...group.adults.map(id => generation.get(id)!));
    const lane = lanes.get(row) || 0;
    if (adults.length > 1) lanes.set(row, lane + 1);
    anchors.set(group.id, { x, y: floor + (adults.length > 1 ? 32 + lane * 16 : 0) });
  }
  return { width: result.width + 2 * (PAD - 20),
    height: Math.max(...[...people].map(([id, point]) => point.y + height(id)), ...[...anchors.values()].map(point => point.y)) + PAD,
    people, anchors, heights };
}

// One adult connection per family; the midpoint is exactly the child origin.
export function familyBridgePath(layout: FamilyLayout, family: string, adults: string[]): string {
  if (adults.length < 2) return '';
  const anchor = layout.anchors.get(family)!;
  const points = adults.map(id => ({ ...layout.people.get(id)!, h: Math.max(CARD_HEIGHT, layout.heights.get(id) || 0) })).sort((a, b) => a.x - b.x);
  if (points.length === 2) {
    const [a, b] = points;
    return `M ${a.x + CARD_WIDTH / 2} ${a.y + a.h} Q ${a.x + CARD_WIDTH / 2} ${anchor.y}, ${anchor.x} ${anchor.y} Q ${b.x + CARD_WIDTH / 2} ${anchor.y}, ${b.x + CARD_WIDTH / 2} ${b.y + b.h}`;
  }
  return points.map(point => `M ${point.x + CARD_WIDTH / 2} ${point.y + point.h} Q ${point.x + CARD_WIDTH / 2} ${anchor.y}, ${anchor.x} ${anchor.y}`).join(' ');
}

// Exactly one stem per child and recorded parent family. Individual ordering
// edges used by layoutGraph never become parallel drawn child stems.
export function childPath(layout: FamilyLayout, family: string, child: string): string {
  const to = layout.people.get(child)!, anchor = layout.anchors.get(family)!;
  const x = to.x + CARD_WIDTH / 2, midY = (anchor.y + to.y) / 2;
  return `M ${anchor.x} ${anchor.y} C ${anchor.x} ${midY}, ${x} ${midY}, ${x} ${to.y}`;
}
