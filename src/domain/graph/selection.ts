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
export function computeHourglass(people: People, rootId: string | string[]): Set<string> {
  // Union of independent views: ancestor traversal must run for every root,
  // even if it was already included as another root's partner or descendant.
  if (Array.isArray(rootId)) {
    return new Set(rootId.flatMap(id => [...computeHourglass(people, id)]));
  }
  const visible = new Set<string>();
  if (!people[rootId]) return visible;
  // downwards: person, partners, all descendants (like the base hull)
  const addDown = (id: string) => {
    if (!people[id] || visible.has(id)) return;
    visible.add(id);
    for (const partner of people[id].partners || []) addDown(partner);
    for (const child of people[id].children || []) addDown(child);
  };
  addDown(rootId);
  // upwards: the parent chain without siblings – but ALWAYS with all
  // partners of each ancestor (second marriages stay visible even though
  // they are off the direct line; their own kin is not pulled in).
  const expanded = new Set<string>();
  const addAnc = (id: string) => {
    for (const parent of (people[id]?.parents || [])) {
      if (!people[parent] || expanded.has(parent)) continue;
      expanded.add(parent);
      visible.add(parent);
      for (const sp of people[parent].partners || []) {
        if (people[sp]) visible.add(sp);
      }
      addAnc(parent);
    }
  };
  addAnc(rootId);
  return visible;
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

