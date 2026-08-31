# Architecture: tree graph rules

This document states the rules the graph view follows. They were decided
deliberately (see the git history for the discussions behind them); change
them here first, then in code. The layout lives in `public/assets/graph.js`
(pure, testable in Node), the rendering in `public/assets/app.js`.

## Foundations

The layout engine is written from scratch — there is no Graphviz, dagre,
ELK or d3 underneath (the only runtime dependencies of the project are
`yaml` and `jszip`, neither of which touches the layout). The algorithm
follows the classic Sugiyama framework — layer assignment, crossing
minimization by ordering, then coordinate assignment — the same family of
methods as Graphviz `dot`, but implemented directly in
`public/assets/graph.js` as a pure, DOM-free module so it runs in the
browser and in the Node test suite alike.

## Pipeline

1. **Visibility** (`computeVisible`, `computeHourglass`): which persons the
   current view shows. The hourglass view follows the direct parent chain of
   the root and always includes every partner of each ancestor on the line
   (second marriages stay visible; their own kin is not pulled in).
2. **Boxes and rings** (`buildFamGraph`): persons become marriage boxes,
   further marriages become ring links, children get descent edges.
3. **Generations** (`computeGenerations`): BFS from the focus person —
   parents −1, children +1, partners level. On conflicts the first visit
   wins, so the assignment depends on the focus.
4. **Layout** (`layoutGraph`): layers by generation, ordering by crossing
   minimization, x positions by iterative relaxation.
5. **Rendering** (`app.js`): boxes, gray descent curves, pink ring lines.

## Box rule: one box per marriage

A box holds at most one couple. Pairing is **mutual first choice, iterated
to a fixpoint**: a couple shares a box only if each is the other's
first-listed still-free partnership (partner order in the YAML is the
control — reorder it to change the boxes). Whoever is left over stays in a
single box and keeps all marriages as rings.

Example (the case that shaped the rule): Carla (partners: Schmidt, Ulrich)
and Elisabeth (partners: Gretler, Ulrich) both box up with their first
husbands; Ulrich's first choices are taken, so he stands alone between two
ring lines.

## Ring links

Every partnership whose two persons do not share a box is a **ring link**:
a pink line docked at the two person rows, with a double-ring symbol at the
midpoint. Short rings (neighbouring boxes) are straight; long rings sag as
a smooth curve into the free corridor below the layer band instead of
cutting through boxes.

## Descent anchors

A child descends from its parents' **marriage anchor** with a single gray
edge:

- both parents in one box → bottom edge of that box,
- parents in two boxes but married (ring) → the ring midpoint
  (a second, invisible layout-only edge keeps the attraction to the other
  parent's box),
- otherwise (single known parent, or unmarried parents in two boxes) →
  one edge per parent box.

Half-siblings are therefore distinguishable at a glance: they hang from
different anchors.

## Color semantics

One meaning per visual dimension:

- **Color = relationship kind.** Descent gray, marriage pink. No further
  static line colors (branch coloring does not scale and is arbitrary).
- **Dashing = evidence status.** Dashed lines mean placeholder/unverified
  (placeholder ancestors); solid means recorded.

## Layout rules

- **Sibling blocks**: children of the same parents form an indivisible
  block ordered under their parents; crossing minimization swaps blocks and
  neighbours, evaluated by total crossings with total horizontal span as
  the tie-breaker (rings count in the span, so ring-linked boxes prefer to
  be close).
- **Key scales** (`groupSortDown`): nodes with parents sort on the parent
  index scale (×1000). Parentless nodes have no key on that scale — they
  anchor to their current left neighbour and only order among themselves by
  their children. (Sorting them on their raw own index tore every
  married-in single to the far left of its layer.)
- **Ring adjacency pass** (after ordering): a ring partner without any own
  edges (married in, no kin, no children) cannot cause a crossing and moves
  unconditionally next to its partner box; it also follows that box in the
  x relaxation. Movers with few edges (≤3) may pay up to 2 crossings for
  adjacency — a short local crossing beats a layer-wide ring line. Everyone
  else moves only if crossings do not increase.
- **X positions**: iterative relaxation toward the average of parents and
  children, with symmetric overlap resolution; the order never changes in
  this phase.
- **Effort scales with graph size**: above 150 nodes the ordering runs
  fewer optimization rounds, and above 400 nodes the expensive stages
  (cascade transpose, extra restarts) are skipped entirely — a few more
  crossings, but seconds instead of minutes. Below these thresholds the
  quality is unchanged.

## Measuring changes

`npm run metrics` (manual only, never wired into build/test/CI) reports
drawn crossings, ring gaps, the widest in-layer hole and the total width
for a dataset, and `--check <file>` evaluates thresholds against it — see
`scripts/layout-checks.example.yaml`. Run it before and after touching
`graph.js`; keep a dataset-specific checks file next to private data.

## Known limitations

- A ring between two boxes that are both anchored in distant family blocks
  stays long (e.g. a woman boxed with her first husband in family A whose
  second husband is boxed in family B). The sagging curve keeps it
  readable; adjacency would cost crossings and is refused.
- Deep ancestor towers of unrelated lines stand far apart on the top
  layers. That is tree geometry, not a bug: those layers only contain the
  towers themselves.
- Generation assignment is focus-dependent when marriages connect
  generations inconsistently.
