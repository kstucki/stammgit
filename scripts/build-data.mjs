import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const root = process.cwd();
const treesDir = path.join(root, "data", "trees");
const outDir = path.join(root, "public", "data");
const outTrees = path.join(outDir, "trees");
fs.mkdirSync(outTrees, { recursive: true });

const config = YAML.parse(fs.readFileSync(path.join(root, "data", "config.yaml"), "utf8"));

const index = [];
for (const file of fs.readdirSync(treesDir).filter((f) => f.endsWith(".yaml")).sort()) {
  const id = file.replace(/\.yaml$/, "");
  const data = YAML.parse(fs.readFileSync(path.join(treesDir, file), "utf8"));
  fs.writeFileSync(path.join(outTrees, `${id}.json`), JSON.stringify(data, null, 2), "utf8");
  fs.copyFileSync(path.join(treesDir, file), path.join(outTrees, `${id}.yaml`));
  index.push({ id, title: data.meta?.title || id, people: Object.keys(data.people || {}).length });
}
let defaultTree = "family";
try {
  defaultTree = fs.readFileSync(path.join(root, "data", "default-tree.txt"), "utf8").trim() || "family";
} catch { /* file is optional */ }
if (!index.some((t) => t.id === defaultTree)) defaultTree = "family";
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


console.log(index.map((t) => `${t.id}: ${t.people} persons`).join(", "));
