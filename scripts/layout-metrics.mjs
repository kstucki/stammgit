// Manual layout smoke metrics — NOT part of `npm run build` or `npm test`.
// Run when changing anything in graph.js:
//   node scripts/layout-metrics.mjs [data/trees/<tree>.yaml] [--check <checks.yaml>]
//
// Without --check it prints a report (crossings, ring gaps, holes, width).
// With --check it evaluates thresholds and exits non-zero on violations.
//
// checks.yaml format:
//   checks:
//     - { metric: crossings, max: 30 }
//     - { metric: ringMax,   max: 400 }
//     - { metric: ringSum,   max: 1500 }
//     - { metric: maxHole,   max: 8000 }
//     - { metric: width,     max: 22000 }
//     - { metric: pairGap, persons: [id_a, id_b], max: 60 }
//     - { metric: pairGap, persons: [id_a, id_b], max: 60, roots: [some_root] }
// `roots` restricts a check to the view spanned by those roots
// (computeVisible); without it the full dataset is measured.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import YAML from "yaml";
import { computeVisible, buildFamGraph, layoutGraph, computeGenerations } from "../public/assets/graph.js";

const root = path.join(path.dirname(url.fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkIdx = args.indexOf("--check");
const checkFile = checkIdx >= 0 ? args[checkIdx + 1] : null;
const fileArgs = args.filter((a, i) => a !== "--check" && i !== checkIdx + 1);
const config = YAML.parse(fs.readFileSync(path.join(root, "data", "config.yaml"), "utf8"));
const treeFile = fileArgs[0] || path.join("data", "trees", `${config.defaultTree}.yaml`);

const d = YAML.parse(fs.readFileSync(path.join(root, treeFile), "utf8"));
const people = d.people;

// Box measure — keep in sync with measureNode in public/assets/app.js.
const yr = (x) => (String(x || "").match(/\d{4}/) || [""])[0];
const yearsOf = (p) => {
  const b = yr(p.birth), dd = yr(p.death);
  return b && dd ? `${b}–${dd}` : b ? `* ${b}` : dd ? `† ${dd}` : "";
};
const measure = (n) => {
  const lines = n.type === "placeholder"
    ? [n.label || "? + ?"]
    : n.persons.map((pid) => {
        const p = people[pid] || {};
        const y = yearsOf(p);
        return `${p.name || pid}${y ? `  ${y}` : ""}`;
      });
  const maxLen = Math.max(...lines.map((t) => t.length), 6);
  return { w: Math.min(340, maxLen * 7.6 + 48), h: lines.length * 17 + 16 };
};

function metricsFor(roots) {
  const visible = computeVisible(people, roots, new Set(), { includeOrphans: roots.length > 1 });
  const gen = computeGenerations(people, visible, roots.includes(d.meta.focusPersonId) ? d.meta.focusPersonId : roots[0]);
  const laid = layoutGraph(buildFamGraph(people, visible, {}), measure, gen);
  const byId = new Map(laid.nodes.map((n) => [n.id, n]));
  const layers = new Map();
  for (const n of laid.nodes) {
    if (!layers.has(n.gen)) layers.set(n.gen, []);
    layers.get(n.gen).push(n);
  }
  const ord = new Map();
  for (const ns of layers.values()) {
    ns.sort((a, b) => a.x - b.x);
    ns.forEach((n, i) => ord.set(n.id, i));
  }
  let crossings = 0;
  const byGap = new Map();
  for (const e of laid.edges) {
    if (e.layoutOnly) continue;
    const a = byId.get(e.from);
    if (!byGap.has(a.gen)) byGap.set(a.gen, []);
    byGap.get(a.gen).push([ord.get(e.from), ord.get(e.to)]);
  }
  for (const pairs of byGap.values()) {
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    for (let i = 0; i < pairs.length; i++)
      for (let j = i + 1; j < pairs.length; j++)
        if (pairs[i][1] > pairs[j][1]) crossings++;
  }
  const boxGap = (A, B) =>
    Math.max(0, Math.max(A.x - A.w / 2, B.x - B.w / 2) - Math.min(A.x + A.w / 2, B.x + B.w / 2));
  const rings = laid.rings.map((r) => ({ a: r.a, b: r.b, gap: Math.round(boxGap(byId.get(r.na), byId.get(r.nb))) }));
  let maxHole = 0;
  for (const ns of layers.values())
    for (let i = 0; i + 1 < ns.length; i++)
      maxHole = Math.max(maxHole, (ns[i + 1].x - ns[i + 1].w / 2) - (ns[i].x + ns[i].w / 2));
  const nodeOf = (pid) => laid.nodes.find((n) => n.persons?.includes(pid));
  return {
    crossings,
    rings,
    ringSum: Math.round(rings.reduce((s, r) => s + r.gap, 0)),
    ringMax: Math.round(Math.max(0, ...rings.map((r) => r.gap))),
    maxHole: Math.round(maxHole),
    width: Math.round(laid.width),
    pairGap: (a, b) => {
      const A = nodeOf(a), B = nodeOf(b);
      return A && B ? Math.round(boxGap(A, B)) : null;
    }
  };
}

const allRoots = Object.keys(people);
const cache = new Map();
const forRoots = (roots) => {
  const key = roots.join(",");
  if (!cache.has(key)) cache.set(key, metricsFor(roots));
  return cache.get(key);
};

const full = forRoots(allRoots);
console.log(`${treeFile}: crossings ${full.crossings} | ringSum ${full.ringSum} | ringMax ${full.ringMax} | maxHole ${full.maxHole} | width ${full.width}`);
for (const r of full.rings) console.log(`  ring ${r.a} ⚭ ${r.b}: ${r.gap}px`);

if (checkFile) {
  const cfg = YAML.parse(fs.readFileSync(path.join(root, checkFile), "utf8"));
  let failures = 0;
  for (const c of cfg.checks || []) {
    const m = forRoots(c.roots || allRoots);
    const value = c.metric === "pairGap" ? m.pairGap(c.persons[0], c.persons[1]) : m[c.metric];
    const label = c.metric === "pairGap" ? `pairGap(${c.persons.join(" ↔ ")})` : c.metric;
    const scope = c.roots ? ` [roots: ${c.roots.join(",")}]` : "";
    if (value === null || value === undefined) {
      failures++;
      console.log(`FAIL ${label}${scope}: not measurable (missing person/metric).`);
    } else if (value > c.max) {
      failures++;
      console.log(`FAIL ${label}${scope}: ${value} > ${c.max}`);
    } else {
      console.log(`ok   ${label}${scope}: ${value} <= ${c.max}`);
    }
  }
  if (failures) {
    console.log(`${failures} layout check(s) failed.`);
    process.exit(1);
  }
  console.log("All layout checks passed.");
}
