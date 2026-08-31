import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { contentHash } from "../netlify/shared/content-hash.mjs";

const root = process.cwd();
const treesDir = path.join(root, "data", "trees");
const outDir = path.join(root, "public", "data");
const outTrees = path.join(outDir, "trees");
fs.mkdirSync(outTrees, { recursive: true });

const config = YAML.parse(fs.readFileSync(path.join(root, "data", "config.yaml"), "utf8"));

const index = [];
const sourceLinks = {}; // url -> { treeId: linkCount } across all datasets
const photoRefs = new Set(); // /photos/<file> referenced by any dataset
for (const file of fs.readdirSync(treesDir).filter((f) => f.endsWith(".yaml")).sort()) {
  const id = file.replace(/\.yaml$/, "");
  const raw = fs.readFileSync(path.join(treesDir, file), "utf8");
  const data = YAML.parse(raw);
  fs.writeFileSync(path.join(outTrees, `${id}.json`), JSON.stringify(data, null, 2), "utf8");
  fs.copyFileSync(path.join(treesDir, file), path.join(outTrees, `${id}.yaml`));
  index.push({ id, title: data.meta?.title || id, people: Object.keys(data.people || {}).length, contentHash: contentHash(raw) });
  for (const p of Object.values(data.people || {})) {
    if (p.photo) photoRefs.add(p.photo);
    for (const s of p.sources || []) {
      sourceLinks[s.url] = sourceLinks[s.url] || {};
      sourceLinks[s.url][id] = (sourceLinks[s.url][id] || 0) + 1;
    }
  }
}
const defaultTree = String(config.defaultTree || "").trim();
if (!index.some((t) => t.id === defaultTree)) {
  console.error(`config.yaml: defaultTree '${defaultTree}' is not a dataset in data/trees/.`);
  process.exit(1);
}
fs.writeFileSync(
  path.join(outTrees, "index.json"),
  JSON.stringify({ trees: index, defaultTree }, null, 2),
  "utf8"
);

// Validate instance configuration against the default dataset
const defaultData = YAML.parse(fs.readFileSync(path.join(treesDir, `${defaultTree}.yaml`), "utf8"));
for (const line of config?.overview?.extraLines || []) {
  if (!defaultData.people[line.person]) {
    console.error(`config.yaml: extraLines references unknown person '${line.person}'.`);
    process.exit(1);
  }
}
fs.writeFileSync(path.join(outDir, "config.json"), JSON.stringify(config, null, 2), "utf8");
fs.writeFileSync(path.join(outDir, "source-links.json"), JSON.stringify(sourceLinks, null, 2), "utf8");

// Point out source files no longer referenced by any dataset (not an error).
const sourcesDir = path.join(root, "public", "sources");
if (fs.existsSync(sourcesDir)) {
  const orphans = fs.readdirSync(sourcesDir)
    .filter((f) => !f.startsWith(".") && !sourceLinks[`/sources/${f}`]);
  if (orphans.length) {
    console.log(`Note: ${orphans.length} source file(s) not referenced by any dataset: ${orphans.join(", ")}`);
  }
}
// Chronicle: emit public/data/chronicle-<tree>.json for trees with chapters.
for (const tree of index.map((t) => t.id)) {
  const dir = path.join(root, "public", "chronicle", tree);
  const idxFile = path.join(dir, "index.yaml");
  if (!fs.existsSync(idxFile)) continue;
  const { parseChapter, extractTokens } = await import("../public/assets/chronicle.js");
  const order = YAML.parse(fs.readFileSync(idxFile, "utf8"))?.chapters || [];
  const chapters = [];
  for (const file of order) {
    const full = path.join(dir, file);
    if (!fs.existsSync(full)) continue; // test.mjs turns this into a failure
    const { frontmatter, body } = parseChapter(fs.readFileSync(full, "utf8"));
    const tokens = extractTokens(body);
    chapters.push({ file, title: frontmatter.title || file, date: frontmatter.date || null, persons: tokens.persons, sources: tokens.sources });
  }
  fs.writeFileSync(path.join(root, "public", "data", `chronicle-${tree}.json`), JSON.stringify({ chapters }, null, 2));
  console.log(`chronicle ${tree}: ${chapters.length} chapter(s)`);
}

const photosDir = path.join(root, "public", "photos");
if (fs.existsSync(photosDir)) {
  const orphans = fs.readdirSync(photosDir)
    .filter((f) => !f.startsWith(".") && !photoRefs.has(`/photos/${f}`));
  if (orphans.length) {
    console.log(`Note: ${orphans.length} photo(s) not referenced by any dataset: ${orphans.join(", ")}`);
  }
}

console.log(index.map((t) => `${t.id}: ${t.people} persons`).join(", "));
