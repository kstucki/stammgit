import type { Dataset } from './person';
import type { FamilySlice } from './family';
import { familyIndex, projectFamily } from './family';

export interface ConnectionEdge { a: string; b: string; kind: 'parent' | 'partner' }

// Only relationships drawn by the shared family graph (the former full view).
// Explicit sibling fields do not create extra diagram edges. Parent edges retain their direction for display,
// but all relationship types can be traversed in either direction for searching.
export function connectionEdges(data: Dataset): ConnectionEdge[] {
  const edges = new Map<string, ConnectionEdge>();
  const add = (a: string, b: string, kind: ConnectionEdge['kind']) => {
    if (a === b || !Object.hasOwn(data.people, a) || !Object.hasOwn(data.people, b)) return;
    if (kind !== 'parent' && a > b) [a, b] = [b, a];
    edges.set(JSON.stringify([kind, a, b]), { a, b, kind });
  };
  for (const [id, person] of Object.entries(data.people)) {
    for (const parent of person.parents || []) add(parent, id, 'parent');
    for (const partner of person.partners || []) add(id, partner, 'partner');
  }
  return [...edges.values()];
}

// Union of all simple paths on the person/family incidence graph. A family
// point can be visited only once, just like a person. No shortest-path cutoff.
export function simplePathEdges(ids: string[], pairs: [string, string][], selected: string[]) {
  const adjacency = new Map(ids.map(id => [id, [] as number[]]));
  pairs.forEach(([a, b], i) => { adjacency.get(a)!.push(i); adjacency.get(b)!.push(i); });
  const discovered = new Map<string, number>(), low = new Map<string, number>();
  const component = new Map<string, string>(), stack: number[] = [], blocks: number[][] = [];
  let clock = 0;
  for (const root of adjacency.keys()) {
    if (discovered.has(root)) continue;
    const enter = (id: string) => { discovered.set(id, ++clock); low.set(id, clock); component.set(id, root); };
    enter(root);
    const frames = [{ id: root, parent: -1, next: 0 }];
    while (frames.length) {
      const frame = frames[frames.length - 1], neighbors = adjacency.get(frame.id)!;
      if (frame.next < neighbors.length) {
        const edge = neighbors[frame.next++]; if (edge === frame.parent) continue;
        const [a, b] = pairs[edge], other = a === frame.id ? b : a;
        if (!discovered.has(other)) {
          stack.push(edge); enter(other); frames.push({ id: other, parent: edge, next: 0 });
        } else if (discovered.get(other)! < discovered.get(frame.id)!) {
          stack.push(edge); low.set(frame.id, Math.min(low.get(frame.id)!, discovered.get(other)!));
        }
      } else {
        frames.pop();
        if (frame.parent < 0) continue;
        const parent = frames[frames.length - 1].id;
        low.set(parent, Math.min(low.get(parent)!, low.get(frame.id)!));
        if (low.get(frame.id)! >= discovered.get(parent)!) {
          const block: number[] = []; let edge: number;
          do { edge = stack.pop()!; block.push(edge); } while (edge !== frame.parent);
          blocks.push(block);
        }
      }
    }
  }
  const vertices = new Map(ids.map((id, i) => [id, i]));
  const forest: Set<number>[] = Array.from({ length: ids.length + blocks.length }, () => new Set());
  blocks.forEach((block, i) => {
    const node = ids.length + i;
    for (const id of new Set(block.flatMap(edge => pairs[edge]))) {
      const vertex = vertices.get(id)!; forest[node].add(vertex); forest[vertex].add(node);
    }
  });
  const terminals = new Set(selected.map(id => vertices.get(id)!)), removed = new Set<number>();
  const queue = forest.flatMap((neighbors, i) => neighbors.size <= 1 && !terminals.has(i) ? [i] : []);
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i]; if (removed.has(node)) continue;
    removed.add(node);
    for (const neighbor of forest[node]) {
      forest[neighbor].delete(node);
      if (forest[neighbor].size <= 1 && !terminals.has(neighbor)) queue.push(neighbor);
    }
  }
  const retained = new Set(blocks.flatMap((block, i) => removed.has(ids.length + i) ? [] : block));
  const components = [...new Set(selected.map(id => component.get(id)))].map(root => selected.filter(id => component.get(id) === root));
  return { retained, components };
}

export function selectConnections(data: Dataset, selection: string[]) {
  const selected = [...new Set(selection)].filter(id => Object.hasOwn(data.people, id));
  if (!selected.length) return { selected, edges: [] as ConnectionEdge[], components: [] as string[][], family: null };
  const index = familyIndex(data);
  const full = projectFamily(index, selected[0], new Set(Object.keys(data.people)));
  const personKey = (id: string) => JSON.stringify(['person', id]);
  const groupKey = (id: string) => JSON.stringify(['family', id]);
  const nodes = [...full.people.map(personKey), ...full.groups.map(group => groupKey(group.id))];
  const memberships = full.groups.flatMap(group => [...new Set([...group.adults, ...group.children])]
    .map(person => ({ group: group.id, person })));
  const pairs: [string, string][] = memberships.map(({ group, person }) => [groupKey(group), personKey(person)]);
  const paths = simplePathEdges(nodes, pairs, selected.map(personKey));
  const active = new Map<string, Set<string>>();
  for (const i of paths.retained) {
    const { group, person } = memberships[i];
    if (!active.has(group)) active.set(group, new Set());
    active.get(group)!.add(person);
  }
  // Keep the existing parent bridge of a retained family, including its adult
  // cards, so sibling paths still have their documented parents. Do not expand
  // these context adults' other families or restore discarded child stems.
  const groups = full.groups.filter(group => active.has(group.id)).map(group => ({ ...group,
    children: group.children.filter(child => active.get(group.id)!.has(child)),
  }));
  const visible = new Set([...selected, ...groups.flatMap(group => [...group.adults, ...group.children])]);
  const projected = projectFamily(index, selected[0], visible);
  const parentEdges = new Set(groups.flatMap(group => group.children.flatMap(child => group.adults.map(parent => JSON.stringify([parent, child])))));
  const partnerEdges = new Set(groups.filter(group => group.partnership).flatMap(group =>
    group.adults.flatMap((a, i) => group.adults.slice(i + 1).map(b => JSON.stringify([a, b].sort())))));
  const family: FamilySlice = { ...projected, groups,
    generationParents: projected.generationParents.filter(({ parent, child }) => parentEdges.has(JSON.stringify([parent, child]))),
  };
  const edges = connectionEdges(data).filter(edge => edge.kind === 'parent'
    ? parentEdges.has(JSON.stringify([edge.a, edge.b])) : partnerEdges.has(JSON.stringify([edge.a, edge.b].sort())));
  const components = paths.components.map(ids => ids.map(id => JSON.parse(id)[1] as string));
  return { selected, edges, components, family };
}
