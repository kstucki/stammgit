// Reiner Graph-Aufbau und Layout für den Stammbaum (ohne DOM, testbar in Node).

function uniq(arr = []) { return [...new Set(arr.filter(Boolean))]; }

// Sichtbare Personen: Nachkommen-Hülle der Basiswurzeln plus stufenweise aufgeklappte Linien.
// Ein aufgeklappter Anker zeigt die Eltern seiner Person (samt deren Nachkommen).
// Reine Ketten (nur ein Elternteil mit weiteren Vorfahren) laufen automatisch weiter nach oben;
// bei einer Gabelung (beide Elternteile haben Vorfahren) stoppt die Stufe, und jede Seite
// erhält ihren eigenen Aufklapp-Knopf.
export function computeVisible(people, baseRootIds, expandedAnchors = new Set()) {
  const visible = new Set();
  const addDown = (id) => {
    if (!people[id] || visible.has(id)) return;
    visible.add(id);
    // Partner vollständig einblenden (inkl. deren Kinder aus anderen Verbindungen) –
    // so bleiben Stieffamilien wie Böhme/Jäckh in Gesamtansicht und Nachkommen-Modus sichtbar.
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
    // Automatisch weiter, solange die Linie nicht gabelt
    const continuing = parents.filter((p) => hiddenParents(p).length);
    if (continuing.length === 1) reveal(continuing[0], guard + 1);
  };

  // Anker wirken erst, wenn ihre Person sichtbar ist (Verkettung über mehrere Stufen)
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
  return visible;
}

// Sanduhr-Sicht: nur die direkte Vorfahrenlinie der Zentrumsperson (ohne Seitenäste)
// plus ihre vollständige Nachkommenschaft.
export function computeHourglass(people, rootId) {
  const visible = new Set();
  if (!people[rootId]) return visible;
  // abwärts: Person, Partner, alle Nachkommen (wie Basis-Hülle)
  const addDown = (id) => {
    if (!people[id] || visible.has(id)) return;
    visible.add(id);
    for (const partner of people[id].partners || []) addDown(partner);
    for (const child of people[id].children || []) addDown(child);
  };
  addDown(rootId);
  // aufwärts: nur die Eltern-Kette, keine Geschwister, keine Partner ausserhalb der Linie
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

// Personen, an denen sich eine verborgene Vorfahrenlinie aufklappen lässt.
export function findAnchors(people, visible) {
  const anchors = [];
  for (const id of visible) {
    const hiddenParents = (people[id]?.parents || []).filter((p) => people[p] && !visible.has(p));
    if (hiddenParents.length) anchors.push(id);
  }
  return anchors;
}

// Generationen relativ zur Fokusperson: Eltern -1, Kinder +1, Partner gleich.
export function computeGenerations(people, visible, focusId) {
  const gen = new Map();
  if (!visible.has(focusId)) {
    // Fallback: irgendeine sichtbare Person als Nullpunkt
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
  for (const id of visible) if (!gen.has(id)) gen.set(id, 0);
  return gen;
}

// Familien-Knoten (Paare bzw. Einzelpersonen) und Kanten bauen.
export function buildFamGraph(people, visible, { placeholderRoots = [] } = {}) {
  const nodes = [];
  const nodeById = new Map();
  const homeOf = new Map(); // personId -> nodeId

  // Partnerschafts-Komponenten: eine Person erscheint genau einmal.
  // Bei Wiederverheiratung entsteht EIN Knoten mit allen Partnern
  // (z. B. Thomas + Barbara (geschieden) + Ursula (Partnerin)).
  const compRoot = new Map();
  const find = (x) => {
    let r = x;
    while (compRoot.get(r) !== r) r = compRoot.get(r);
    let c = x;
    while (compRoot.get(c) !== c) { const n = compRoot.get(c); compRoot.set(c, r); c = n; }
    return r;
  };
  for (const id of visible) compRoot.set(id, id);
  for (const id of visible) {
    for (const partner of people[id]?.partners || []) {
      if (visible.has(partner)) compRoot.set(find(partner), find(id));
    }
  }
  const comps = new Map();
  for (const id of visible) {
    const r = find(id);
    if (!comps.has(r)) comps.set(r, []);
    comps.get(r).push(id);
  }
  for (const members of comps.values()) {
    // Blutlinie zuerst (Person mit sichtbaren Eltern), dann nach Name
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

  // Eltern→Kind-Kanten (alle Familien einer Person anbinden, damit
  // Zweitpartnerschaften neben der Erstfamilie stehen)
  const famsOfPerson = new Map();
  for (const n of nodes) {
    for (const pid of n.persons) {
      if (!famsOfPerson.has(pid)) famsOfPerson.set(pid, []);
      famsOfPerson.get(pid).push(n.id);
    }
  }
  const edges = [];
  const edgeSeen = new Set();
  for (const id of visible) {
    const parents = (people[id]?.parents || []).filter((p) => visible.has(p));
    if (!parents.length) continue;
    const fromFams = [...new Set(parents.map((par) => homeOf.get(par)))];
    for (const from of fromFams) {
      for (const to of famsOfPerson.get(id) || [homeOf.get(id)]) {
        if (!from || !to || from === to) continue;
        const ekey = `${from}->${to}`;
        if (edgeSeen.has(ekey)) continue;
        edgeSeen.add(ekey);
        edges.push({ from, to, dashed: false });
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

  return { nodes, edges, homeOf };
}

// Ebenen aus festen Generationen (relativ zur Fokusperson), dann Barycenter-Anordnung.
export function layoutGraph(graph, measure, personGen = null) {
  const { nodes, edges } = graph;
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
    // Feste Generationen: Knoten-Ebene = Generation seiner Personen (Partner sind gleichauf)
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
    // Fallback: längster Pfad von einer Quelle
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

  // Masse
  for (const n of nodes) {
    const m = measure(n);
    n.w = m.w; n.h = m.h;
  }

  // Ebenen füllen
  const maxGen = Math.max(...nodes.map((n) => gen.get(n.id)));
  const layers = Array.from({ length: maxGen + 1 }, () => []);
  for (const n of nodes) layers[gen.get(n.id)].push(n);

  const GAP = 28, ROW = 120;

  // --- Phase 1: Reihenfolge pro Ebene ---
  // Grundprinzip: Kinder derselben Eltern (Geschwister) bilden einen unteilbaren Block.
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

  // Primärer Eltern-Knoten = der am weitesten links stehende
  const primaryParent = (id) => {
    const ps = (parentsOf.get(id) || []).filter((p) => idx.has(p));
    if (!ps.length) return null;
    return ps.reduce((a, b) => (idx.get(a) <= idx.get(b) ? a : b));
  };

  // Abwärts: Ebene als Folge von Geschwister-Blöcken unter den Eltern anordnen
  const groupSortDown = (layer) => {
    const blockKey = new Map();  // nodeId -> [primärEltern-Idx, sekundär]
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
  // Aufwärts: Eltern nach Schwerpunkt ihrer Kinder sortieren (bringt verschwägerte Familien zusammen)
  const sortUp = (layer) => {
    const key = new Map();
    layer.forEach((n, i) => {
      const refs = (childrenOf.get(n.id) || []).map((r) => idx.get(r)).filter((x) => x !== undefined);
      const m = median(refs);
      key.set(n.id, m === null ? i : m);
    });
    layer.sort((a, b) => key.get(a.id) - key.get(b.id));
  };

  // Kanten je Ebenenpaar einmal vorberechnen
  const gapEdges = Array.from({ length: Math.max(0, 64) }, () => []);
  for (const e of edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) continue;
    const g = gen.get(a.id);
    if (gen.get(b.id) === g + 1 && g >= 0 && g < gapEdges.length) gapEdges[g].push(e);
  }
  // Inversionen via Mergesort: O(k log k) statt O(k²)
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

  // Zweitkriterium bei gleicher Kreuzungszahl: horizontale Gesamtauslenkung
  // der Kanten (in zentrierten Ebenen-Indizes). Hält Ahnenketten senkrecht
  // über ihren Familien und die Elternlinien eines Paars beieinander.
  const totalSpan = () => {
    // pixel-zentrierte Position je Knoten aus der aktuellen Reihenfolge
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
    return s;
  };

  // Transpose auf Block-Ebene: ganze Geschwister-Blöcke tauschen, innerhalb eines Blocks einzelne Geschwister
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
  // Tausch mit Kaskade: nach jedem Tausch werden die Ebenen darunter neu unter
  // ihren Eltern gruppiert und die GESAMT-Kreuzungen verglichen. So werden auch
  // Verbesserungen gefunden, die erst nach Umsortieren der Kinder wirksam werden.
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
  const permLimit = 6;
  const transposeIters = 8;
  const transpose = (withPerms = true) => {
    let cur = totalCrossings();
    let curS = totalSpan();
    // Schmale Ebenen: alle Block-Reihenfolgen durchprobieren (nur im ersten Round)
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
        // Blöcke tauschen
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
        // Innerhalb der Blöcke einzelne Nachbarn tauschen
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
  const rounds = bigGraph ? 4 : 6;
  const runRounds = () => {
    for (let round = 0; round < rounds; round++) {
      for (let g = maxGen - 1; g >= 0; g--) { sortUp(layers[g]); reindex(); }
      for (let g = 1; g <= maxGen; g++) { groupSortDown(layers[g]); reindex(); }
      transpose();
      const c = totalCrossings();
      const sp = totalSpan();
      if (c < bestC || (c === bestC && sp < bestSpan - 1e-9)) { bestC = c; bestSpan = sp; best = snapshot(); }
      if (bestC === 0) return;
    }
  };
  runRounds();
  // Weitere Anläufe aus anderen Startzuständen, solange nicht kreuzungsfrei:
  // umgekehrte Ordnung, dann (bei kleinen Graphen) deterministisch gemischte Ordnungen.
  const totalNodes = nodes.length;
  const extraStarts = totalNodes <= 90 ? 4 : 1;
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

  // Abschliessender Vorfahren-Kamm: alle Ebenen von unten nach oben stabil
  // unter ihren Kindern gruppieren. Beide Eltern eines Paars erhalten denselben
  // Schlüssel und stehen dadurch nebeneinander; Ahnenketten folgen senkrecht.
  // Wird nur übernommen, wenn dabei keine zusätzlichen Kreuzungen entstehen.
  {
    const before = totalCrossings();
    const snap = snapshot();
    for (let g = maxGen - 1; g >= 0; g--) { sortUp(layers[g]); reindex(); }
    if (totalCrossings() > before) restore(snap);
  }

  // --- Phase 2: x-Positionen (Reihenfolge bleibt fix) ---
  layers.forEach((layer) => {
    let cursor = 0;
    for (const n of layer) { n.x = cursor + n.w / 2; cursor += n.w + GAP; }
  });

  const pull = (layer, refMap) => {
    for (const n of layer) {
      const refs = (refMap.get(n.id) || []).map((r) => byId.get(r)).filter((r) => r && r.x != null);
      n.desired = refs.length ? refs.reduce((sum, r) => sum + r.x, 0) / refs.length : n.x;
    }
    // Überlappungen symmetrisch auflösen: Mittel aus links- und rechtsauflösender
    // Anordnung, damit Kollisionen nicht systematisch nach rechts drücken.
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
    // Mindestabstände final sichern
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
  // Verdichtung: alle Nachbarn (Eltern + Kinder) gemeinsam anziehen,
  // zieht lose, zu breite Abschnitte zusammen.
  const bothMap = new Map(nodes.map((n) => [n.id, [...(parentsOf.get(n.id) || []), ...(childrenOf.get(n.id) || [])]]));
  for (let pass = 0; pass < 3; pass++) {
    for (let g = 0; g <= maxGen; g++) pull(layers[g], bothMap);
  }

  // Normalisieren
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
    width: maxX - minX + 40,
    height: (maxGen + 1) * ROW + 40
  };
}
