import { arrangeNeighbors, compactPartnerNeighbors } from './neighbors';
import type { NeighborConstraints } from './neighbors';
import type { GraphNode, GraphEdge, LayoutGraph, LayoutNode, GraphLayout, Size } from './types';

// Typed port of the established optimizer. Without `neighbors`, coordinates
// match public/assets/graph.js exactly (parity.test.ts). The optional partner repair
// runs once after optimization; it cannot change selection or generations.
export function layoutGraph(graph: LayoutGraph, measure: (node: GraphNode) => Size, personGen: ReadonlyMap<string, number> | null = null, neighbors?: NeighborConstraints): GraphLayout {
  const edges = graph.edges;
  // Work on owned nodes: the comparison engine must not mutate its input.
  const nodes: LayoutNode[] = graph.nodes.map(node => ({ ...node, w: 0, h: 0, x: 0, y: 0, gen: 0, desired: 0 }));
  if (!nodes.length) return { nodes: [], edges: [], rings: [], width: 40, height: 40 };
  const rings = graph.rings || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const parentsOf = new Map(nodes.map((n) => [n.id, [] as string[]]));
  const childrenOf = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue;
    parentsOf.get(e.to)!.push(e.from);
    childrenOf.get(e.from)!.push(e.to);
  }

  const gen = new Map<string, number>();
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
    const visit = (id: string, stack = new Set<string>()): number => {
      if (gen.has(id)) return gen.get(id)!;
      if (stack.has(id)) return 0;
      stack.add(id);
      const ps = parentsOf.get(id)! || [];
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
  const maxGen = Math.max(...nodes.map((n) => gen.get(n.id)!));
  const layers: LayoutNode[][] = Array.from({ length: maxGen + 1 }, () => []);
  for (const n of nodes) layers[gen.get(n.id)!].push(n);

  const GAP = 28, ROW = 120;

  // --- Phase 1: order per layer ---
  // Core principle: children of the same parents (siblings) form an indivisible block.
  const idx = new Map<string, number>();
  const reindex = () => layers.forEach((layer) => layer.forEach((n, i) => idx.set(n.id, i)));
  const order = new Map<string, number>();
  let counter = 0;
  const dfs = (id: string) => {
    if (order.has(id)) return;
    order.set(id, counter++);
    for (const c of childrenOf.get(id)! || []) dfs(c);
  };
  nodes.filter((n) => !(parentsOf.get(n.id)! || []).length).forEach((n) => dfs(n.id));
  nodes.forEach((n) => dfs(n.id));
  layers.forEach((layer) => layer.sort((a, b) => order.get(a.id)! - order.get(b.id)!));
  reindex();

  const median = (values: number[]) => {
    if (!values.length) return null;
    const v = [...values].sort((a, b) => a - b);
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };

  // Primary parent node = the leftmost one
  const primaryParent = (id: string) => {
    const ps = (parentsOf.get(id)! || []).filter((p) => idx.has(p));
    if (!ps.length) return null;
    return ps.reduce((a, b) => (idx.get(a)! <= idx.get(b)! ? a : b));
  };

  // Downwards: arrange the layer as a sequence of sibling blocks under the parents
  const groupSortDown = (layer: LayoutNode[]) => {
    const blockKey = new Map<string, number[]>();  // nodeId -> [primary parent idx, secondary]
    // Parentless nodes have no key on the parent-index scale (idx*1000);
    // a raw own-index key would sort them all to the far left of the
    // layer. They anchor to their current left neighbour instead and only
    // order among themselves by their children (or stay put).
    let prev = [-1e9, 0], tie = 0;
    for (const n of layer) {
      const pp = primaryParent(n.id);
      const kids = (childrenOf.get(n.id)! || []).map((c) => idx.get(c)!).filter((x) => x !== undefined);
      const sec = median(kids);
      if (pp === null) {
        tie += 1;
        blockKey.set(n.id, [prev[0], sec === null ? prev[1] + tie * 1e-6 : sec]);
        continue;
      }
      const key = [idx.get(pp)! * 1000, sec === null ? idx.get(n.id)! : sec];
      blockKey.set(n.id, key);
      prev = key; tie = 0;
    }
    layer.sort((a, b) => {
      const ka = blockKey.get(a.id)!, kb = blockKey.get(b.id)!;
      return ka[0] - kb[0] || ka[1] - kb[1];
    });
  };
  // Upwards: sort parents by the barycenter of their children (brings in-law families together)
  const sortUp = (layer: LayoutNode[]) => {
    const key = new Map<string, number>();
    layer.forEach((n, i) => {
      const refs = (childrenOf.get(n.id)! || []).map((r) => idx.get(r)!).filter((x) => x !== undefined);
      const m = median(refs);
      key.set(n.id, m === null ? i : m);
    });
    layer.sort((a, b) => key.get(a.id)! - key.get(b.id)!);
  };

  // Precompute edges per layer pair once
  // One bucket per layer gap – sized from the actual graph. A fixed cap here
  // silently dropped the edges of deeper layers out of the crossing count.
  const gapEdges: GraphEdge[][] = Array.from({ length: Math.max(1, maxGen + 1) }, () => []);
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const g = gen.get(a.id)!;
    if (gen.get(b.id)! === g + 1 && g >= 0 && g < gapEdges.length) gapEdges[g].push(e);
  }
  // Inversions via mergesort: O(k log k) instead of O(k²)
  const countInv = (arr: number[]) => {
    if (arr.length < 2) return 0;
    const buf = arr.slice();
    let inv = 0;
    const rec = (lo: number, hi: number) => {
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
  const crossingsBetween = (gUpper: number) => {
    const ge = gapEdges[gUpper] || [];
    if (ge.length < 2) return 0;
    const pairs = ge.map((e) => [idx.get(e.from)!, idx.get(e.to)!]);
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    return countInv(pairs.map((p) => p[1]));
  };
  const totalCrossings = () => {
    let c = 0;
    for (let g = 0; g < maxGen; g++) c += crossingsBetween(g);
    return c;
  };

  // Tie-breaker on equal crossing counts: total horizontal deflection
  // of the edges (in centered layer indices). Keeps ancestor chains vertical
  // above their families and the parent lines of a couple together.
  const totalSpan = () => {
    // pixel-centered position per node from the current order
    const pos = new Map<string, number>();
    for (const layer of layers) {
      let cursor = 0;
      for (const n of layer) { pos.set(n.id, cursor + n.w / 2); cursor += n.w + GAP; }
      const width = cursor - GAP;
      for (const n of layer) pos.set(n.id, pos.get(n.id)! - width / 2);
    }
    let s = 0;
    for (const e of edges) {
      if (!pos.has(e.from) || !pos.has(e.to)) continue;
      s += Math.abs(pos.get(e.from)! - pos.get(e.to)!);
    }
    // Ring-linked boxes prefer to be close: counts once in the tie-breaker
    // (ordering only, no positional pull – that distorted the layout).
    for (const r of rings) {
      if (!pos.has(r.na) || !pos.has(r.nb)) continue;
      s += Math.abs(pos.get(r.na)! - pos.get(r.nb)!);
    }
    return s;
  };

  // Transpose at block level: swap whole sibling blocks, and single siblings within a block
  const blocksOf = (layer: LayoutNode[]) => {
    const blocks: { key: string; nodes: LayoutNode[] }[] = [];
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
  const restoreLayers = (snap: LayoutNode[][]) => { snap.forEach((l, g) => { layers[g] = [...l]; }); reindex(); };
  const cascadeBelow = (g: number) => {
    for (let gg = g + 1; gg <= maxGen; gg++) { groupSortDown(layers[gg]); reindex(); }
  };
  const permutations = <T>(arr: T[]): T[][] => {
    if (arr.length <= 1) return [arr];
    const out: T[][] = [];
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
  const hugeGraph = nodes.length > 600;
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

  let best: string[][] | null = null;
  let bestC = Infinity, bestSpan = Infinity;
  const snapshot = () => layers.map((l) => l.map((n) => n.id));
  const restore = (snap: string[][]) => {
    snap.forEach((ids, g) => {
      const byIdMap = new Map(layers[g].map((n) => [n.id, n]));
      layers[g] = ids.map((id) => byIdMap.get(id)!);
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

  // Ring adjacency: move ring partners next to each other in the order
  // when it does not cost any crossings (married-in boxes move, blood
  // boxes stay). Fixes very wide ring lines.
  // Nodes without any DRAWN edge have no visible footprint: their descent
  // (if any) starts at the ring midpoint, which moves along with them.
  const hasDrawnEdge = new Set<string>();
  for (const e of edges) {
    if (e.layoutOnly) continue;
    hasDrawnEdge.add(e.from); hasDrawnEdge.add(e.to);
  }
  for (let ringPass = 0; ringPass < 2 && rings.length; ringPass++) {
    let cur = totalCrossings(), curS = totalSpan();
    for (const r of rings) {
      const a = byId.get(r.na), b = byId.get(r.nb);
      if (!a || !b) continue;
      const g = gen.get(a.id)!;
      if (gen.get(b.id)! !== g) continue;
      if (Math.abs(idx.get(a.id)! - idx.get(b.id)!) <= 1) continue;
      // A node without drawn edges cannot cause a visible crossing: move it
      // next to its partner unconditionally, no cascade needed.
      const freeMover = !hasDrawnEdge.has(a.id) ? a : !hasDrawnEdge.has(b.id) ? b : null;
      if (freeMover) {
        const anchor = freeMover === a ? b : a;
        const rest = layers[g].filter((n) => n !== freeMover);
        rest.splice(rest.indexOf(anchor) + 1, 0, freeMover);
        layers[g] = rest;
        reindex();
        continue;
      }
      const aBlood = (parentsOf.get(a.id)! || []).length > 0;
      const bBlood = (parentsOf.get(b.id)! || []).length > 0;
      const mover = aBlood && !bBlood ? b : !aBlood && bBlood ? a : b;
      const anchor = mover === a ? b : a;
      // Small branches may pay up to 2 crossings for adjacency — a short
      // local crossing beats a layer-wide ring line.
      const moverEdges = (parentsOf.get(mover.id)! || []).length + (childrenOf.get(mover.id)! || []).length;
      const tolerance = moverEdges <= 3 ? 2 : 0;
      for (const side of [1, 0]) {
        const snap = snapshotLayers();
        const rest = layers[g].filter((n) => n !== mover);
        rest.splice(rest.indexOf(anchor) + side, 0, mover);
        layers[g] = rest;
        reindex();
        cascadeBelow(g);
        const c = totalCrossings(), sp = totalSpan();
        if (c < cur || (c <= cur + tolerance && sp < curS - 1e-9)) { cur = c; curS = sp; break; }
        restoreLayers(snap);
      }
    }
  }

  if (neighbors) layers.forEach(layer => arrangeNeighbors(layer, neighbors));

  // --- Phase 2: x positions (order stays fixed) ---
  layers.forEach((layer) => {
    let cursor = 0;
    for (const n of layer) { n.x = cursor + n.w / 2; cursor += n.w + GAP; }
  });

  const pull = (layer: LayoutNode[], refMap: ReadonlyMap<string, string[]>) => {
    for (const n of layer) {
      const refs = (refMap.get(n.id) || []).map((r) => byId.get(r)).filter((r): r is LayoutNode => r !== undefined && r.x != null);
      n.desired = refs.length ? refs.reduce((sum, r) => sum + r.x, 0) / refs.length : n.x;
    }
    // Resolve overlaps symmetrically: average of left- and right-resolving
    // placement so collisions do not push systematically to the right.
    const L: number[] = new Array(layer.length), R: number[] = new Array(layer.length);
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
  const bothMap = new Map(nodes.map((n) => [n.id, [...(parentsOf.get(n.id)! || []), ...(childrenOf.get(n.id)! || [])]]));
  // Nodes without any own edges follow their ring partner in x — only
  // those, so the ring exerts no pull on the rest of the layout.
  for (const r of rings) {
    if (!byId.has(r.na) || !byId.has(r.nb)) continue;
    if (!hasDrawnEdge.has(r.na)) bothMap.get(r.na)!.push(r.nb);
    if (!hasDrawnEdge.has(r.nb)) bothMap.get(r.nb)!.push(r.na);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let g = 0; g <= maxGen; g++) pull(layers[g], bothMap);
  }

  if (neighbors) layers.forEach(layer => compactPartnerNeighbors(layer, neighbors, GAP));

  // Normalize
  let minX = Infinity, maxX = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - n.w / 2);
    maxX = Math.max(maxX, n.x + n.w / 2);
  }
  for (const n of nodes) {
    n.x = n.x - minX + 20;
    n.y = gen.get(n.id)! * ROW + 20;
    n.gen = gen.get(n.id)!;
  }

  return {
    nodes,
    edges: edges.filter((e) => byId.has(e.from) && byId.has(e.to)),
    rings: rings.filter((r) => byId.has(r.na) && byId.has(r.nb)),
    width: maxX - minX + 40,
    height: (maxGen + 1) * ROW + 40
  };
}
