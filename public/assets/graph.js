// Pure graph construction and layout for the family tree (no DOM, testable in Node).

function uniq(arr = []) { return [...new Set(arr.filter(Boolean))]; }

// Visible persons: descendant hull of the base roots plus lines expanded step by step.
// An expanded anchor shows its person's parents (including their descendants).
// Pure chains (only one parent with further ancestors) automatically continue upwards;
// at a fork (both parents have ancestors) the step stops and each side
// gets its own expand button.
export function computeVisible(people, baseRootIds, expandedAnchors = new Set(), options = {}) {
  const visible = new Set();
  const addDown = (id) => {
    if (!people[id] || visible.has(id)) return;
    visible.add(id);
    // Show partners completely (including their children from other relationships) –
    // this keeps step families visible in full view and descendants mode.
    for (const partner of people[id].partners || []) addDown(partner);
    for (const child of people[id].children || []) addDown(child);
  };
  baseRootIds.forEach(addDown);

  const hiddenParents = (id) =>
    (people[id]?.parents || []).filter((p) => people[p] && !visible.has(p));

  const reveal = (id, guard = 0) => {
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
    const marked = new Set();
    for (const pid of Object.keys(people)) {
      if (visible.has(pid) || marked.has(pid)) continue;
      const comp = [];
      const stack = [pid];
      marked.add(pid);
      let touchesVisible = false;
      while (stack.length) {
        const cur = stack.pop();
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
export function computeHourglass(people, rootId) {
  const visible = new Set();
  if (!people[rootId]) return visible;
  // downwards: person, partners, all descendants (like the base hull)
  const addDown = (id) => {
    if (!people[id] || visible.has(id)) return;
    visible.add(id);
    for (const partner of people[id].partners || []) addDown(partner);
    for (const child of people[id].children || []) addDown(child);
  };
  addDown(rootId);
  // upwards: only the parent chain, no siblings, no partners outside the line
  const addAnc = (id) => {
    for (const parent of (people[id]?.parents || [])) {
      if (!people[parent] || visible.has(parent)) continue;
      visible.add(parent);
      addAnc(parent);
    }
  };
  addAnc(rootId);
  return visible;
}

// Persons where a hidden ancestor line can be expanded.
export function findAnchors(people, visible) {
  const anchors = [];
  for (const id of visible) {
    const hiddenParents = (people[id]?.parents || []).filter((p) => people[p] && !visible.has(p));
    if (hiddenParents.length) anchors.push(id);
  }
  return anchors;
}

// Generations relative to the focus person: parents -1, children +1, partners equal.
export function computeGenerations(people, visible, focusId) {
  const gen = new Map();
  if (!visible.has(focusId)) {
    // Fallback: any visible person as origin
    focusId = [...visible][0];
  }
  gen.set(focusId, 0);
  const queue = [focusId];
  while (queue.length) {
    const id = queue.shift();
    const g = gen.get(id);
    const neighbors = [
      ...(people[id]?.parents || []).map(x => [x, g - 1]),
      ...(people[id]?.children || []).map(x => [x, g + 1]),
      ...(people[id]?.partners || []).map(x => [x, g])
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
      const cur = q.shift();
      const g0 = gen.get(cur);
      const neighbours = [
        ...(people[cur]?.parents || []).map((x) => [x, g0 - 1]),
        ...(people[cur]?.children || []).map((x) => [x, g0 + 1]),
        ...(people[cur]?.partners || []).map((x) => [x, g0])
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

// Build family nodes (couples or single persons), ring links and edges.
export function buildFamGraph(people, visible, { placeholderRoots = [] } = {}) {
  const nodes = [];
  const nodeById = new Map();
  const homeOf = new Map(); // personId -> nodeId

  // One box per partnership, at most two persons. Persons are walked in
  // data (YAML) order; each still-unpaired person takes its FIRST-listed
  // still-unpaired visible partner into the box. Every further marriage
  // becomes a ring link between two boxes.
  const orderedVisible = Object.keys(people).filter((id) => visible.has(id));
  const mate = new Map(); // personId -> boxed partner or null
  for (const id of orderedVisible) {
    if (mate.has(id)) continue;
    const partner = (people[id]?.partners || []).find(
      (x) => x !== id && visible.has(x) && people[x] && !mate.has(x)
    );
    if (partner) { mate.set(id, partner); mate.set(partner, id); }
    else mate.set(id, null);
  }
  const seen = new Set();
  for (const id of orderedVisible) {
    if (seen.has(id)) continue;
    const members = mate.get(id) ? [id, mate.get(id)] : [id];
    members.forEach((m) => seen.add(m));
    // Bloodline first (person with visible parents), then by name
    members.sort((a, b) => {
      const av = (people[a]?.parents || []).some((x) => visible.has(x)) ? 0 : 1;
      const bv = (people[b]?.parents || []).some((x) => visible.has(x)) ? 0 : 1;
      return av - bv || (people[a]?.name || "").localeCompare(people[b]?.name || "");
    });
    const key = members.length > 1 ? `fam:${[...members].sort().join("|")}` : `single:${members[0]}`;
    const node = { id: key, type: members.length > 1 ? "fam" : "single", persons: members };
    nodes.push(node);
    nodeById.set(key, node);
    for (const m of members) homeOf.set(m, key);
  }

  // Ring links: every partnership whose two persons do not share a box.
  const ringIdOf = (a, b) => `ring:${[a, b].sort().join("|")}`;
  const rings = [];
  const ringSeen = new Set();
  for (const id of orderedVisible) {
    for (const partner of people[id]?.partners || []) {
      if (!visible.has(partner) || !people[partner]) continue;
      if (homeOf.get(partner) === homeOf.get(id)) continue;
      const rid = ringIdOf(id, partner);
      if (ringSeen.has(rid)) continue;
      ringSeen.add(rid);
      rings.push({ id: rid, a: id, b: partner, na: homeOf.get(id), nb: homeOf.get(partner) });
    }
  }

  // Parent -> child edges, anchored at the parents' marriage:
  // both parents in one box -> from that box; parents in two boxes but
  // married (ring) -> ONE drawn edge from the ring (plus a layout-only
  // edge keeping the attraction to the second box); otherwise one edge
  // per parent box, as before.
  const edges = [];
  const edgeSeen = new Set();
  const pushEdge = (e) => {
    const key = `${e.from}->${e.to}:${e.ring || ""}${e.layoutOnly ? ":L" : ""}`;
    if (edgeSeen.has(key)) return;
    edgeSeen.add(key);
    edges.push(e);
  };
  for (const id of visible) {
    const parents = (people[id]?.parents || []).filter((p) => visible.has(p) && people[p]);
    if (!parents.length) continue;
    const to = homeOf.get(id);
    if (!to) continue;
    const homes = [...new Set(parents.map((par) => homeOf.get(par)))].filter(Boolean);
    const rid = parents.length === 2 ? ringIdOf(parents[0], parents[1]) : null;
    if (homes.length === 2 && rid && ringSeen.has(rid)) {
      pushEdge({ from: homes[0], to, dashed: false, ring: rid });
      pushEdge({ from: homes[1], to, dashed: false, layoutOnly: true });
    } else {
      for (const from of homes) {
        if (from === to) continue;
        pushEdge({ from, to, dashed: false });
      }
    }
  }

  // Placeholder ancestors: 2 great-grandparent couples + 1 grandparent couple
  for (const rootPerson of placeholderRoots) {
    if (!visible.has(rootPerson)) continue;
    if ((people[rootPerson]?.parents || []).some((p) => people[p])) continue;
    const gp = { id: `ph:gp:${rootPerson}`, type: "placeholder", persons: [], label: "? + ?  (Eltern, nicht erfasst)", ph: { person: rootPerson, offset: -1 } };
    const g1 = { id: `ph:ggp1:${rootPerson}`, type: "placeholder", persons: [], label: "? + ?  (Urgrosseltern)", ph: { person: rootPerson, offset: -2 } };
    const g2 = { id: `ph:ggp2:${rootPerson}`, type: "placeholder", persons: [], label: "? + ?  (Urgrosseltern)", ph: { person: rootPerson, offset: -2 } };
    nodes.push(gp, g1, g2);
    edges.push({ from: g1.id, to: gp.id, dashed: true });
    edges.push({ from: g2.id, to: gp.id, dashed: true });
    edges.push({ from: gp.id, to: homeOf.get(rootPerson), dashed: true });
  }

  return { nodes, edges, rings, homeOf };
}

// Layers from fixed generations (relative to the focus person), then barycenter ordering.
export function layoutGraph(graph, measure, personGen = null) {
  const { nodes, edges } = graph;
  const rings = graph.rings || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parentsOf = new Map(nodes.map((n) => [n.id, []]));
  const childrenOf = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    parentsOf.get(e.to).push(e.from);
    childrenOf.get(e.from).push(e.to);
  }

  const gen = new Map();
  if (personGen) {
    // Fixed generations: node layer = generation of its persons (partners are level)
    for (const n of nodes) {
      if (n.ph) gen.set(n.id, (personGen.get(n.ph.person) ?? 0) + n.ph.offset);
      else {
        const gens = n.persons.map((pid) => personGen.get(pid)).filter((g) => g !== undefined);
        gen.set(n.id, gens.length ? Math.min(...gens) : 0);
      }
    }
    const minG = Math.min(...gen.values());
    for (const [k, v] of gen) gen.set(k, v - minG);
  } else {
    // Fallback: longest path from a source
    const visit = (id, stack = new Set()) => {
      if (gen.has(id)) return gen.get(id);
      if (stack.has(id)) return 0;
      stack.add(id);
      const ps = parentsOf.get(id) || [];
      const g = ps.length ? Math.max(...ps.map((p) => visit(p, stack))) + 1 : 0;
      stack.delete(id);
      gen.set(id, g);
      return g;
    };
    nodes.forEach((n) => visit(n.id));
  }

  // Sizes
  for (const n of nodes) {
    const m = measure(n);
    n.w = m.w; n.h = m.h;
  }

  // Fill layers
  const maxGen = Math.max(...nodes.map((n) => gen.get(n.id)));
  const layers = Array.from({ length: maxGen + 1 }, () => []);
  for (const n of nodes) layers[gen.get(n.id)].push(n);

  const GAP = 28, ROW = 120;

  // --- Phase 1: order per layer ---
  // Core principle: children of the same parents (siblings) form an indivisible block.
  const idx = new Map();
  const reindex = () => layers.forEach((layer) => layer.forEach((n, i) => idx.set(n.id, i)));
  const order = new Map();
  let counter = 0;
  const dfs = (id) => {
    if (order.has(id)) return;
    order.set(id, counter++);
    for (const c of childrenOf.get(id) || []) dfs(c);
  };
  nodes.filter((n) => !(parentsOf.get(n.id) || []).length).forEach((n) => dfs(n.id));
  nodes.forEach((n) => dfs(n.id));
  layers.forEach((layer) => layer.sort((a, b) => order.get(a.id) - order.get(b.id)));
  reindex();

  const median = (values) => {
    if (!values.length) return null;
    const v = [...values].sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };

  // Primary parent node = the leftmost one
  const primaryParent = (id) => {
    const ps = (parentsOf.get(id) || []).filter((p) => idx.has(p));
    if (!ps.length) return null;
    return ps.reduce((a, b) => (idx.get(a) <= idx.get(b) ? a : b));
  };

  // Downwards: arrange the layer as a sequence of sibling blocks under the parents
  const groupSortDown = (layer) => {
    const blockKey = new Map();  // nodeId -> [primary parent idx, secondary]
    for (const n of layer) {
      const pp = primaryParent(n.id);
      const kids = (childrenOf.get(n.id) || []).map((c) => idx.get(c)).filter((x) => x !== undefined);
      const sec = median(kids);
      blockKey.set(n.id, [pp === null ? idx.get(n.id) - 0.5 : idx.get(pp) * 1000, sec === null ? idx.get(n.id) : sec]);
    }
    layer.sort((a, b) => {
      const ka = blockKey.get(a.id), kb = blockKey.get(b.id);
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
  };
  // Upwards: sort parents by the barycenter of their children (brings in-law families together)
  const sortUp = (layer) => {
    const key = new Map();
    layer.forEach((n, i) => {
      const refs = (childrenOf.get(n.id) || []).map((r) => idx.get(r)).filter((x) => x !== undefined);
      const m = median(refs);
      key.set(n.id, m === null ? i : m);
    });
    layer.sort((a, b) => key.get(a.id) - key.get(b.id));
  };

  // Precompute edges per layer pair once
  const gapEdges = Array.from({ length: Math.max(0, 64) }, () => []);
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const g = gen.get(a.id);
    if (gen.get(b.id) === g + 1 && g >= 0 && g < gapEdges.length) gapEdges[g].push(e);
  }
  // Inversions via mergesort: O(k log k) instead of O(k²)
  const countInv = (arr) => {
    if (arr.length < 2) return 0;
    const buf = arr.slice();
    let inv = 0;
    const rec = (lo, hi) => {
      if (hi - lo < 2) return;
      const mid = (lo + hi) >> 1;
      rec(lo, mid); rec(mid, hi);
      let i = lo, j = mid, k = lo;
      while (i < mid && j < hi) {
        if (arr[i] <= arr[j]) buf[k++] = arr[i++];
        else { inv += mid - i; buf[k++] = arr[j++]; }
      }
      while (i < mid) buf[k++] = arr[i++];
      while (j < hi) buf[k++] = arr[j++];
      for (let t = lo; t < k; t++) arr[t] = buf[t];
    };
    rec(0, arr.length);
    return inv;
  };
  const crossingsBetween = (gUpper) => {
    const ge = gapEdges[gUpper] || [];
    if (ge.length < 2) return 0;
    const pairs = ge.map((e) => [idx.get(e.from), idx.get(e.to)]);
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    return countInv(pairs.map((p) => p[1]));
  };
  const totalCrossings = () => {
    let c = 0;
    for (let g = 0; g < maxGen; g++) c += crossingsBetween(g);
    return c;
  };
  const localCrossings = (g) =>
    (g > 0 ? crossingsBetween(g - 1) : 0) + (g < maxGen ? crossingsBetween(g) : 0);

  // Tie-breaker on equal crossing counts: total horizontal deflection
  // of the edges (in centered layer indices). Keeps ancestor chains vertical
  // above their families and the parent lines of a couple together.
  const totalSpan = () => {
    // pixel-centered position per node from the current order
    const pos = new Map();
    for (const layer of layers) {
      let cursor = 0;
      for (const n of layer) { pos.set(n.id, cursor + n.w / 2); cursor += n.w + GAP; }
      const width = cursor - GAP;
      for (const n of layer) pos.set(n.id, pos.get(n.id) - width / 2);
    }
    let s = 0;
    for (const e of edges) {
      if (!pos.has(e.from) || !pos.has(e.to)) continue;
      s += Math.abs(pos.get(e.from) - pos.get(e.to));
    }
    // Ring-linked boxes want to be neighbours: their distance counts
    // double in the tie-breaker.
    for (const r of rings) {
      if (!pos.has(r.na) || !pos.has(r.nb)) continue;
      s += 2 * Math.abs(pos.get(r.na) - pos.get(r.nb));
    }
    return s;
  };

  // Transpose at block level: swap whole sibling blocks, and single siblings within a block
  const blocksOf = (layer) => {
    const blocks = [];
    for (const n of layer) {
      const pp = primaryParent(n.id);
      const key = pp === null ? `solo:${n.id}` : `p:${pp}`;
      if (blocks.length && blocks[blocks.length - 1].key === key) blocks[blocks.length - 1].nodes.push(n);
      else blocks.push({ key, nodes: [n] });
    }
    return blocks;
  };
  // Swap with cascade: after each swap the layers below are regrouped under
  // their parents and TOTAL crossings are compared. This also finds
  // improvements that only pay off after the children are reordered.
  const snapshotLayers = () => layers.map((l) => [...l]);
  const restoreLayers = (snap) => { snap.forEach((l, g) => { layers[g] = [...l]; }); reindex(); };
  const cascadeBelow = (g) => {
    for (let gg = g + 1; gg <= maxGen; gg++) { groupSortDown(layers[gg]); reindex(); }
  };
  const permutations = (arr) => {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      for (const rest of permutations([...arr.slice(0, i), ...arr.slice(i + 1)])) {
        out.push([arr[i], ...rest]);
      }
    }
    return out;
  };
  const bigGraph = nodes.length > 150;
  // Effort scaling: very large graphs skip the expensive optimization stages
  // (cascade transpose, extra starts) – a few more crossings, but seconds
  // instead of minutes. Quality is unchanged below the threshold.
  const hugeGraph = nodes.length > 400;
  const permLimit = 6;
  const transposeIters = 8;
  const transpose = (withPerms = true) => {
    let cur = totalCrossings();
    let curS = totalSpan();
    // Narrow layers: try all block permutations (first round only)
    for (let g = 0; withPerms && g <= maxGen; g++) {
      const blocks = blocksOf(layers[g]);
      if (blocks.length < 2 || blocks.length > permLimit) continue;
      let bestSnap = snapshotLayers(), bestC = cur, bestS = curS;
      for (const perm of permutations(blocks)) {
        layers[g] = perm.flatMap((b) => b.nodes);
        reindex();
        cascadeBelow(g);
        const c = totalCrossings();
        const sp = totalSpan();
        if (c < bestC || (c === bestC && sp < bestS - 1e-9)) { bestC = c; bestS = sp; bestSnap = snapshotLayers(); }
      }
      restoreLayers(bestSnap);
      cur = bestC; curS = bestS;
    }
    for (let iter = 0; iter < transposeIters; iter++) {
      let improved = false;
      for (let g = 0; g <= maxGen; g++) {
        // Swap blocks
        for (let i = 0; ; i++) {
          const blocks = blocksOf(layers[g]);
          if (i + 1 >= blocks.length) break;
          const snap = snapshotLayers();
          const swapped = [...blocks.slice(0, i), blocks[i + 1], blocks[i], ...blocks.slice(i + 2)];
          layers[g] = swapped.flatMap((b) => b.nodes);
          reindex();
          cascadeBelow(g);
          const c = totalCrossings();
          const sp = totalSpan();
          if (c < cur || (c === cur && sp < curS - 1e-9)) { cur = c; curS = sp; improved = true; }
          else restoreLayers(snap);
        }
        // Swap single neighbours within blocks
        for (let li = 0; li + 1 < layers[g].length; li++) {
          const blocks = blocksOf(layers[g]);
          const inSameBlock = blocks.some((b) => b.nodes.includes(layers[g][li]) && b.nodes.includes(layers[g][li + 1]));
          if (!inSameBlock) continue;
          const snap = snapshotLayers();
          [layers[g][li], layers[g][li + 1]] = [layers[g][li + 1], layers[g][li]];
          reindex();
          cascadeBelow(g);
          const c = totalCrossings();
          const sp = totalSpan();
          if (c < cur || (c === cur && sp < curS - 1e-9)) { cur = c; curS = sp; improved = true; }
          else restoreLayers(snap);
        }
      }
      if (!improved) break;
    }
  };

  let best = null, bestC = Infinity, bestSpan = Infinity;
  const snapshot = () => layers.map((l) => l.map((n) => n.id));
  const restore = (snap) => {
    snap.forEach((ids, g) => {
      const byIdMap = new Map(layers[g].map((n) => [n.id, n]));
      layers[g] = ids.map((id) => byIdMap.get(id));
    });
    reindex();
  };
  const rounds = hugeGraph ? 3 : bigGraph ? 4 : 6;
  const runRounds = () => {
    for (let round = 0; round < rounds; round++) {
      for (let g = maxGen - 1; g >= 0; g--) { sortUp(layers[g]); reindex(); }
      for (let g = 1; g <= maxGen; g++) { groupSortDown(layers[g]); reindex(); }
      if (!hugeGraph) transpose();
      const c = totalCrossings();
      const sp = totalSpan();
      if (c < bestC || (c === bestC && sp < bestSpan - 1e-9)) { bestC = c; bestSpan = sp; best = snapshot(); }
      if (bestC === 0) return;
    }
  };
  runRounds();
  // Further attempts from other start states while not crossing-free:
  // reversed order, then (for small graphs) deterministically shuffled orders.
  const totalNodes = nodes.length;
  const extraStarts = hugeGraph ? 0 : totalNodes <= 90 ? 4 : 1;
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let attempt = 0; attempt < extraStarts && bestC > 0; attempt++) {
    if (attempt === 0) {
      layers.forEach((layer) => layer.reverse());
    } else {
      layers.forEach((layer) => {
        for (let i = layer.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          [layer[i], layer[j]] = [layer[j], layer[i]];
        }
      });
    }
    reindex();
    runRounds();
  }
  if (best) restore(best);

  // Final ancestor comb: group all layers bottom-up stably
  // under their children. Both parents of a couple get the same
  // key and therefore stand side by side; ancestor chains follow vertically.
  // Only adopted if no additional crossings arise.
  {
    const before = totalCrossings();
    const snap = snapshot();
    for (let g = maxGen - 1; g >= 0; g--) { sortUp(layers[g]); reindex(); }
    if (totalCrossings() > before) restore(snap);
  }

  // --- Phase 2: x positions (order stays fixed) ---
  layers.forEach((layer) => {
    let cursor = 0;
    for (const n of layer) { n.x = cursor + n.w / 2; cursor += n.w + GAP; }
  });

  const pull = (layer, refMap) => {
    for (const n of layer) {
      const refs = (refMap.get(n.id) || []).map((r) => byId.get(r)).filter((r) => r && r.x != null);
      n.desired = refs.length ? refs.reduce((sum, r) => sum + r.x, 0) / refs.length : n.x;
    }
    // Resolve overlaps symmetrically: average of left- and right-resolving
    // placement so collisions do not push systematically to the right.
    const L = new Array(layer.length), R = new Array(layer.length);
    let cursor = -Infinity;
    layer.forEach((n, i) => { L[i] = Math.max(n.desired, cursor + n.w / 2); cursor = L[i] + n.w / 2 + GAP; });
    cursor = Infinity;
    for (let i = layer.length - 1; i >= 0; i--) {
      const n = layer[i];
      R[i] = Math.min(n.desired, cursor - n.w / 2 - GAP);
      cursor = R[i] - n.w / 2;
    }
    layer.forEach((n, i) => { n.x = (L[i] + R[i]) / 2; });
    // Enforce minimum gaps finally
    cursor = -Infinity;
    for (const n of layer) {
      n.x = Math.max(n.x, cursor + n.w / 2);
      cursor = n.x + n.w / 2 + GAP;
    }
  };

  for (let pass = 0; pass < 4; pass++) {
    for (let g = 1; g <= maxGen; g++) pull(layers[g], parentsOf);
    for (let g = maxGen - 1; g >= 0; g--) pull(layers[g], childrenOf);
  }
  // Compaction: attract all neighbours (parents + children) jointly,
  // pulls loose, overly wide sections together.
  const bothMap = new Map(nodes.map((n) => [n.id, [...(parentsOf.get(n.id) || []), ...(childrenOf.get(n.id) || [])]]));
  for (const r of rings) {
    if (byId.has(r.na) && byId.has(r.nb)) {
      bothMap.get(r.na).push(r.nb);
      bothMap.get(r.nb).push(r.na);
    }
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let g = 0; g <= maxGen; g++) pull(layers[g], bothMap);
  }

  // Normalize
  let minX = Infinity, maxX = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
  }
  for (const n of nodes) {
    n.x = n.x - minX + 20;
    n.y = gen.get(n.id) * ROW + 20;
    n.gen = gen.get(n.id);
  }

  return {
    nodes,
    edges: edges.filter((e) => byId.has(e.from) && byId.has(e.to)),
    rings: rings.filter((r) => byId.has(r.na) && byId.has(r.nb)),
    width: maxX - minX + 40,
    height: (maxGen + 1) * ROW + 40
  };
}
