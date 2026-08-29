// Build tests: dataset integrity, GEDCOM roundtrip, model operations,
// auth tokens, config validation, layout smoke test.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { exportGedcom, importGedcom } from "../public/assets/gedcom.js";
import { buildFamGraph, layoutGraph, computeGenerations } from "../public/assets/graph.js";

const root = process.cwd();
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error("FAIL:", msg); } };

// --- Load all datasets ---
const treesDir = path.join(root, "data", "trees");
const trees = {};
for (const file of fs.readdirSync(treesDir).filter((f) => f.endsWith(".yaml"))) {
  trees[file.replace(/\.yaml$/, "")] = YAML.parse(fs.readFileSync(path.join(treesDir, file), "utf8"));
}
const cfg = YAML.parse(fs.readFileSync(path.join(root, "data", "config.yaml"), "utf8"));
const defaultTree = String(cfg.defaultTree || "").trim();
check(trees[defaultTree], `config.defaultTree points to unknown dataset '${defaultTree}'.`);
const data = trees[defaultTree];
const ids = new Set(Object.keys(data.people || {}));

// --- 1) Integrity of every dataset ---
for (const [tid, tree] of Object.entries(trees)) {
  const tids = new Set(Object.keys(tree.people || {}));
  check(tids.size > 0, `${tid}: no persons.`);
  check(tids.has(tree.meta?.focusPersonId), `${tid}: focusPersonId missing or unknown.`);
  for (const [pid, p] of Object.entries(tree.people || {})) {
    for (const rel of ["parents", "children", "partners"]) {
      for (const other of p[rel] || []) {
        check(tids.has(other), `${tid}: '${pid}'.${rel} -> unknown id '${other}'.`);
      }
    }
    for (const par of p.parents || []) {
      check((tree.people[par]?.children || []).includes(pid), `${tid}: '${par}' does not list '${pid}' as child.`);
    }
    for (const partner of p.partners || []) {
      check((tree.people[partner]?.partners || []).includes(pid), `${tid}: partner link '${pid}' <-> '${partner}' not symmetric.`);
    }
    for (const child of p.children || []) {
      check((tree.people[child]?.parents || []).includes(pid), `${tid}: '${child}' does not list '${pid}' as parent.`);
    }
    if (p.photo !== undefined) {
      const m = String(p.photo).match(/^\/photos\/([a-zA-Z0-9._-]+\.(?:png|jpe?g))$/);
      check(m, `${tid}: '${pid}'.photo must be /photos/<file>.jpg|png, got '${p.photo}'.`);
      if (m) check(fs.existsSync(path.join(root, "public", "photos", m[1])), `${tid}: '${pid}'.photo file public/photos/${m[1]} is missing.`);
    }
  }
}

// --- 2) GEDCOM roundtrip on the default dataset ---
{
  const ged = exportGedcom(data);
  const indiCount = (ged.match(/^0 @I\d+@ INDI/gm) || []).length;
  check(indiCount === ids.size, `GEDCOM export has ${indiCount} INDI, expected ${ids.size}.`);
  const re = importGedcom(ged);
  check(Object.keys(re.people).length === ids.size, `GEDCOM reimport yields ${Object.keys(re.people).length} persons, expected ${ids.size}.`);
  check(re.meta?.focusPersonId && re.people[re.meta.focusPersonId], "GEDCOM reimport: focus person missing.");
  for (const [pid, p] of Object.entries(re.people)) {
    for (const k of ["parents", "children", "partners"]) {
      for (const x of p[k] || []) check(re.people[x], `GEDCOM reimport: ${pid}.${k} -> ${x} missing.`);
    }
  }
}

// --- 3) app.js: every called own function is defined ---
{
  const appJs = fs.readFileSync(path.join(root, "public", "assets", "app.js"), "utf8");
  const defined = new Set([...appJs.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  for (const m of appJs.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\(|function)/g)) defined.add(m[1]);
  for (const imp of appJs.matchAll(/import\s*\{([^}]+)\}\s*from/g)) {
    imp[1].split(",").forEach(n => defined.add(n.trim().split(/\s+as\s+/).pop()));
  }
  const calls = new Set([...appJs.matchAll(/(?<![.\w$])([a-z][\w$]*)\s*\(/g)].map(m => m[1]));
  const builtins = new Set(["fetch","alert","confirm","prompt","esc","require","import","parseInt","parseFloat",
    "setTimeout","clearTimeout","structuredClone","btoa","atob","encodeURIComponent","decodeURIComponent",
    "isNaN","String","Number","Boolean","unique","years"]);
  for (const c of calls) {
    if (defined.has(c) || builtins.has(c)) continue;
    if (["if","for","while","switch","catch","return","new","function","async","await","typeof"].includes(c)) continue;
    if (/^(render|open|wire|zoom|person|couple|ancestor|root|top|is|get|to|directAncestor|branch|download|partner|export|import|split|gedcom|local|save|load|update|apply|remove|merge|absorb|count|known|resolve|draft|strings)/.test(c)) {
      check(defined.has(c), `app.js calls undefined function '${c}()'.`);
    }
  }
}

// --- 4) Model operations (shared with the app) ---
{
  const { removePersonFromData, removeSourceLinks, countSourceLinks, mergeImportedPeople, absorbPerson } =
    await import("../public/assets/model.js");
  const fail = (msg) => check(false, msg);

  const fixture = () => ({
    meta: { focusPersonId: "a", autoExpand: ["c"] },
    people: {
      a: { name: "A", partners: ["b"], children: ["c"], sources: [{ label: "Doc", url: "/sources/doc.pdf" }] },
      b: { name: "B", partners: ["a"], children: ["c"], partnerDetails: { a: { status: "geschieden" } } },
      c: { name: "C", parents: ["a", "b"], sources: [{ label: "Doc", url: "/sources/doc.pdf" }, { label: "Other", url: "/sources/x.pdf" }] }
    }
  });

  let d = fixture();
  let r = removePersonFromData(d, "b");
  if (!r.ok) fail("model: removing b should succeed.");
  if (d.people.b) fail("model: b was not removed.");
  const dangling = Object.entries(d.people).flatMap(([pid, p]) =>
    ["parents", "children", "partners"].flatMap(k => (p[k] || []).filter(x => x === "b").map(() => `${pid}.${k}`)));
  if (dangling.length) fail(`model: dangling references to b: ${dangling.join(", ")}`);
  if (JSON.stringify(d).includes("partnerDetails")) fail("model: partnerDetails entry for b not cleaned.");

  d = fixture();
  removePersonFromData(d, "c");
  if (d.meta.autoExpand.includes("c")) fail("model: autoExpand not cleaned.");

  d = fixture();
  r = removePersonFromData(d, "a");
  if (r.ok || r.reason !== "focus") fail("model: focus person must not be removable.");

  d = fixture();
  if (countSourceLinks(d.people, "/sources/doc.pdf") !== 2) fail("model: countSourceLinks expected 2.");
  if (removeSourceLinks(d.people, "/sources/doc.pdf") !== 2) fail("model: removeSourceLinks should remove 2.");
  if (d.people.a.sources) fail("model: empty sources array at a not deleted.");

  // merge import: collision-safe ids + duplicate detection
  const base = { meta: { focusPersonId: "k" }, people: { k: { name: "K" }, anna: { name: "Anna Muster", birth: "1950" } } };
  const res = mergeImportedPeople(base, {
    k: { name: "Other K", partners: ["m"], children: ["kid"] },
    m: { name: "M", partners: ["k"] },
    kid: { name: "Kid", parents: ["k", "m"] }
  });
  if (res.added !== 3) fail("merge: expected 3 imported persons.");
  if (!base.people.k_import) fail("merge: collision id k_import missing.");
  if (base.people.k.partners) fail("merge: existing k was modified.");
  if (!base.people.kid.parents.includes("k_import")) fail("merge: parent reference not rewritten.");
  const res2 = mergeImportedPeople(base, { x1: { name: "Anna Muster", birth: "12 APR 1950" } });
  if (res2.duplicates.length !== 1 || res2.duplicates[0].existingId !== "anna") fail("merge: duplicate Anna not detected.");

  // absorb: unify and rewrite
  const d2 = {
    meta: { focusPersonId: "f" },
    people: {
      anna: { name: "Anna", birth: "1950", partners: ["bruno"], children: ["carl"], notes: ["old"] },
      bruno: { name: "Bruno", partners: ["anna"], children: ["carl"] },
      carl: { name: "Carl", parents: ["anna", "bruno"] },
      f: { name: "F" },
      anna2: { name: "Anna (import)", death: "2020", partners: ["dora"], children: ["carl"], notes: ["new"], photo: "/photos/anna2.jpg" },
      dora: { name: "Dora", partners: ["anna2"] }
    }
  };
  const ra = absorbPerson(d2, "anna", "anna2");
  if (!ra.ok) fail("absorb: should succeed.");
  if (d2.people.anna2) fail("absorb: duplicate not deleted.");
  if (!(d2.people.anna.partners || []).includes("dora")) fail("absorb: partner dora not taken over.");
  if (d2.people.dora.partners[0] !== "anna") fail("absorb: dora's reference not rewritten.");
  if (d2.people.anna.death !== "2020") fail("absorb: missing field death not taken over.");
  if (d2.people.anna.photo !== "/photos/anna2.jpg") fail("absorb: photo of absorbed person not taken over.");
  if (!d2.people.anna.notes.includes("new") || !d2.people.anna.notes.includes("old")) fail("absorb: notes not united.");
  // absorbing the focus person transfers the focus
  const rf = absorbPerson(d2, "anna", "f");
  if (!rf.ok) fail("absorb: absorbing the focus person should succeed.");
  if (d2.meta.focusPersonId !== "anna") fail("absorb: focus must transfer to the kept person.");

  // real-data hard tests on the default dataset
  const real = structuredClone(data);
  const victim = Object.keys(real.people).find(id => id !== real.meta.focusPersonId && (real.people[id].partners || []).length);
  removePersonFromData(real, victim);
  for (const [pid, p] of Object.entries(real.people)) {
    for (const k of ["parents", "children", "partners"]) {
      for (const x of p[k] || []) if (!real.people[x]) fail(`model: after removing ${victim}, ${pid}.${k} -> ${x} missing.`);
    }
  }
}

// --- 5) Role auth tokens ---
{
  process.env.FAMILY_TREE_PASSWORD = "test-admin-secret";
  process.env.FAMILY_TREE_USER_PASSWORD = "test-user";
  const { tokenFor, roleFromRequest, requireAdmin } = await import("../netlify/functions/_auth.mjs");
  const fail = (msg) => check(false, msg);
  const req = (cookie) => ({ headers: { get: (k) => (k.toLowerCase() === "cookie" ? cookie : null) } });
  const adminToken = await tokenFor("test-admin-secret", "admin");
  const userToken = await tokenFor("test-admin-secret", "user");
  if ((await roleFromRequest(req(`family_tree_session=${adminToken}`))) !== "admin") fail("auth: admin token not recognized.");
  if ((await roleFromRequest(req(`family_tree_session=${userToken}`))) !== "user") fail("auth: user token not recognized.");
  const adminSig = adminToken.split(".")[1];
  if ((await roleFromRequest(req(`family_tree_session=user.${adminSig}`))) !== null) fail("auth: tampered role must not validate.");
  if ((await roleFromRequest(req("family_tree_session=nonsense"))) !== null) fail("auth: nonsense token must not validate.");
  const forbidden = await requireAdmin(req(`family_tree_session=${userToken}`));
  if (!forbidden || forbidden.status !== 403) fail("auth: requireAdmin must reject user with 403.");
  if ((await requireAdmin(req(`family_tree_session=${adminToken}`))) !== null) fail("auth: requireAdmin must accept admin.");
}

// --- 5b) Every writing endpoint rejects the user role ---
{
  const fail = (msg) => check(false, msg);
  const { tokenFor } = await import("../netlify/functions/_auth.mjs");
  const userToken = await tokenFor("test-admin-secret", "user");
  const adminToken = await tokenFor("test-admin-secret", "admin");
  const writers = ["save-family", "upload-source", "delete-source"];
  for (const name of writers) {
    const handler = (await import(`../netlify/functions/${name}.mjs`)).default;
    const req = (token) => new Request("http://localhost/.netlify/functions/" + name, {
      method: "POST",
      headers: { cookie: `family_tree_session=${token}`, "content-type": "application/json" },
      body: "{}"
    });
    const asUser = await handler(req(userToken));
    if (asUser.status !== 403) fail(`auth: ${name} must reject the user role with 403 (got ${asUser.status}).`);
    const asAdmin = await handler(req(adminToken));
    if (asAdmin.status === 403) fail(`auth: ${name} must not reject the admin role.`);
  }
}

// --- 6) Instance configuration ---
{
  const config = YAML.parse(fs.readFileSync(path.join(root, "data", "config.yaml"), "utf8"));
  check(typeof config.title === "string" && config.title.trim(), "config: title missing.");
  check(["de", "en"].includes(config.language), "config: language must be de or en.");
  check(typeof config.overview?.heading === "string", "config: overview.heading missing.");
  for (const line of config.overview?.extraLines || []) {
    check(typeof line.label === "string" && line.label.trim(), "config: extraLines entry without label.");
    check(ids.has(line.person), `config: extraLines '${line.label}' references unknown person '${line.person}'.`);
  }
}

// --- 6b) Orphan components in full view ---
{
  const { computeVisible, computeGenerations } = await import("../public/assets/graph.js");
  const fail = (msg) => check(false, msg);
  const ppl = {
    root: { name: "Root", children: ["kid"] },
    kid: { name: "Kid", parents: ["root"] },
    hidden_anc: { name: "Hidden", children: ["root"] },   // staged ancestor of root
    isl_a: { name: "IslandA", partners: ["isl_b"], children: ["isl_c"] },
    isl_b: { name: "IslandB", partners: ["isl_a"], children: ["isl_c"] },
    isl_c: { name: "IslandC", parents: ["isl_a", "isl_b"] }
  };
  ppl.root.parents = ["hidden_anc"];
  const vis = computeVisible(ppl, ["root"], new Set(), { includeOrphans: true });
  if (!vis.has("isl_a") || !vis.has("isl_c")) fail("orphans: imported island must be visible in full view.");
  if (vis.has("hidden_anc")) fail("orphans: staged ancestor must stay hidden.");
  const visPlain = computeVisible(ppl, ["root"], new Set());
  if (visPlain.has("isl_a")) fail("orphans: island must NOT appear without includeOrphans (descendants mode).");
  const gen = computeGenerations(ppl, vis, "root");
  if (gen.get("isl_c") !== gen.get("isl_a") + 1) fail("orphans: island generations must be internally consistent.");
}

// --- 7) Layout smoke test on the default dataset ---
{
  const people = data.people;
  const visible = new Set(Object.keys(people));
  const personGen = computeGenerations(people, visible, data.meta.focusPersonId);
  const graph = buildFamGraph(people, visible, {});
  const measure = (n) => ({ w: n.type === "placeholder" ? 150 : 120 + 40 * Math.max(0, n.persons.length - 1), h: 40 + 17 * n.persons.length });
  const laid = layoutGraph(graph, measure, personGen);
  check(laid.nodes.length === graph.nodes.length, "layout: node count mismatch.");
  check(Number.isFinite(laid.width) && laid.width > 0, "layout: invalid width.");
  check(laid.nodes.every(n => Number.isFinite(n.x) && Number.isFinite(n.y)), "layout: non-finite coordinates.");
}

if (failures) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log(`All tests passed (${Object.keys(trees).length} datasets, default '${defaultTree}' with ${ids.size} persons).`);
