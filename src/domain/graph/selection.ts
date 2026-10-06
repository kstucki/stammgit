import type { Dataset } from '../person';
type People = Dataset['people'];

// Visible persons: descendant hull of the base roots plus lines expanded step by step.
// An expanded anchor shows its person's parents (including their descendants).
// Pure chains (only one parent with further ancestors) automatically continue upwards;
// at a fork (both parents have ancestors) the step stops and each side
// gets its own expand button.
export function computeVisible(people: People, baseRootIds: readonly string[], expandedAnchors: ReadonlySet<string> = new Set(), options: { includeOrphans?: boolean } = {}): Set<string> {
  const visible = new Set<string>();
  const addDown = (id: string) => {
    if (!people[id] || visible.has(id)) return;
    visible.add(id);
    // Show partners completely (including their children from other relationships) –
    // this keeps step families visible in full view and descendants mode.
    for (const partner of people[id].partners || []) addDown(partner);
    for (const child of people[id].children || []) addDown(child);
  };
  baseRootIds.forEach(addDown);

  const hiddenParents = (id: string) =>
    (people[id]?.parents || []).filter((p) => people[p] && !visible.has(p));

  const reveal = (id: string, guard = 0) => {
    if (guard > 60) return;
    const parents = (people[id]?.parents || []).filter((p) => people[p]);
    for (const parent of parents) addDown(parent);
    // Continue automatically as long as the line does not fork
    const continuing = parents.filter((p) => hiddenParents(p).length);
    if (continuing.length === 1) reveal(continuing[0], guard + 1);
  };

  // Anchors only take effect once their person is visible (chaining across steps)
  let changed = true;
  while (changed) {
    changed = false;
    for (const anchor of expandedAnchors) {
      if (!people[anchor] || !visible.has(anchor)) continue;
      if (hiddenParents(anchor).length) {
        reveal(anchor);
        changed = true;
      }
    }
  }

  if (options.includeOrphans) {
    // Components with no connection to anything visible (e.g. freshly
    // imported branches) would otherwise stay invisible forever – include
    // them whole. Components that touch the visible set are left alone,
    // so staged ancestor expansion keeps working.
    const marked = new Set<string>();
    for (const pid of Object.keys(people)) {
      if (visible.has(pid) || marked.has(pid)) continue;
      const comp: string[] = [];
      const stack = [pid];
      marked.add(pid);
      let touchesVisible = false;
      while (stack.length) {
        const cur = stack.pop()!;
        comp.push(cur);
        const neighbours = [...(people[cur].parents || []), ...(people[cur].children || []), ...(people[cur].partners || [])];
        for (const nb of neighbours) {
          if (!people[nb]) continue;
          if (visible.has(nb)) { touchesVisible = true; continue; }
          if (!marked.has(nb)) { marked.add(nb); stack.push(nb); }
        }
      }
      if (!touchesVisible) comp.forEach((x) => visible.add(x));
    }
  }
  return visible;
}

// Hourglass view: only the direct ancestor line of the center person (no side branches)
// plus their complete descendants.
function hourglassSelection(people: People, roots: readonly string[], depth: number) {
  const visible = new Set<string>();
  let maxDepth = 0;
  for (const root of roots) {
    // Separate shortest distances for each root and direction. A person reached
    // along a shorter route must be revisited, even if already visible.
    for (const direction of ['children', 'parents'] as const) {
      const distances = new Map<string, number>();
      const queue: [string, number][] = [[root, 0]];
      for (let i = 0; i < queue.length; i++) {
        const [id, distance] = queue[i];
        if (!people[id] || distance > depth || (distances.get(id) ?? Infinity) <= distance) continue;
        distances.set(id, distance);
        visible.add(id);
        for (const partner of people[id].partners || []) {
          if (direction === 'children') queue.push([partner, distance]);
          else if (distance > 0 && people[partner]) visible.add(partner);
        }
        for (const next of people[id][direction] || []) queue.push([next, distance + 1]);
      }
      for (const distance of distances.values()) maxDepth = Math.max(maxDepth, distance);
    }
  }
  return { visible, maxDepth };
}

export function computeHourglass(people: People, rootId: string | string[], depth = Infinity): Set<string> {
  return hourglassSelection(people, Array.isArray(rootId) ? rootId : [rootId], depth).visible;
}

export function hourglassMaxDepth(people: People, roots: readonly string[]): number {
  return hourglassSelection(people, roots, Infinity).maxDepth;
}

// Persons where a hidden ancestor line can be expanded.
export function findAnchors(people: People, visible: ReadonlySet<string>): string[] {
  const anchors = [];
  for (const id of visible) {
    const hiddenParents = (people[id]?.parents || []).filter((p) => people[p] && !visible.has(p));
    if (hiddenParents.length) anchors.push(id);
  }
  return anchors;
}

// Generations relative to the focus person: parents -1, children +1, partners equal.
export function computeGenerations(people: People, visible: ReadonlySet<string>, focusId: string): Map<string, number> {
  const gen = new Map<string, number>();
  if (!visible.size) return gen;
  if (!visible.has(focusId)) {
    // Fallback: any visible person as origin
    focusId = [...visible][0];
  }
  gen.set(focusId, 0);
  const queue = [focusId];
  while (queue.length) {
    const id = queue.shift()!;
    const g = gen.get(id)!;
    const neighbors: [string, number][] = [
      ...(people[id]?.parents || []).map((x): [string, number] => [x, g - 1]),
      ...(people[id]?.children || []).map((x): [string, number] => [x, g + 1]),
      ...(people[id]?.partners || []).map((x): [string, number] => [x, g])
    ];
    for (const [other, og] of neighbors) {
      if (!visible.has(other) || gen.has(other)) continue;
      gen.set(other, og);
      queue.push(other);
    }
  }
  // Components not reached from the focus (e.g. imported branches) get
  // their own BFS so their internal generations stay consistent.
  for (const id of visible) {
    if (gen.has(id)) continue;
    gen.set(id, 0);
    const q = [id];
    while (q.length) {
      const cur = q.shift()!;
      const g0 = gen.get(cur)!;
      const neighbours: [string, number][] = [
        ...(people[cur]?.parents || []).map((x): [string, number] => [x, g0 - 1]),
        ...(people[cur]?.children || []).map((x): [string, number] => [x, g0 + 1]),
        ...(people[cur]?.partners || []).map((x): [string, number] => [x, g0])
      ];
      for (const [other, og] of neighbours) {
        if (!visible.has(other) || gen.has(other)) continue;
        gen.set(other, og);
        q.push(other);
      }
    }
  }
  return gen;
}
