// Local editorial maintenance; no rendering or network in the website build.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import YAML from 'yaml';
import { validateDataset } from '../public/assets/dataset-validation.js';

export function syncEvidence({ root = process.cwd(), tree, check = false }) {
  if (!/^[a-zA-Z0-9_-]+$/.test(tree || '')) throw new Error('Specify a dataset with --tree <dataset>.');
  const directory = path.join(root, 'docs/source-editions');
  const file = path.join(root, 'data/trees', tree + '.yaml');
  const data = YAML.parse(fs.readFileSync(file, 'utf8'));
  const before = JSON.stringify(data);
  const records = fs.readdirSync(path.join(directory, 'belege')).filter(name => /^B\d{6}\.json$/.test(name)).sort()
    .map(name => {
      const record = JSON.parse(fs.readFileSync(path.join(directory, 'belege', name), 'utf8'));
      if (record.id !== name.slice(0, -5)) throw new Error(`Evidence ID differs from filename: ${name}`);
      return { ...record, file: `beleg-${record.id.toLowerCase()}.pdf`, evidence: true };
    });
  records.push(...JSON.parse(fs.readFileSync(path.join(directory, 'originale.json'), 'utf8')));
  const ids = new Set(), files = new Set();
  for (const record of records) {
    if (!/^B\d{6}$/.test(record.id) || typeof record.file !== 'string' || !/^[a-zA-Z0-9._-]+\.pdf$/.test(record.file)
      || !fs.existsSync(path.join(root, 'public/sources', record.file))) throw new Error(`Invalid evidence file: ${record.id}`);
    if (ids.has(record.id) || files.has(record.file)) throw new Error(`Duplicate evidence: ${record.id}`);
    ids.add(record.id); files.add(record.file);
    const url = `/sources/${record.file}`, previous = data.sourceDetails?.[url];
    if (previous?.id && previous.id !== record.id) throw new Error(`Stable ID would change: ${url}`);
    const detail = Object.fromEntries(['id', 'title', 'citation', 'original', 'archive', 'retrieved', 'kind', 'scope']
      .filter(key => record[key]).map(key => [key, record[key]]));
    detail.tags = previous?.tags || [];
    data.sourceDetails ||= {}; data.sourceDetails[url] = detail;
    if (record.evidence) { data.sourceCategories ||= {}; data.sourceCategories[url] = 'belege'; }
  }
  const problems = validateDataset(data); if (problems.length) throw new Error(problems.join('\n'));
  if (check) {
    if (JSON.stringify(data) !== before) throw new Error(`Evidence metadata differs; run node scripts/sync-evidence.mjs --tree ${tree}.`);
  } else if (JSON.stringify(data) !== before) fs.writeFileSync(file, YAML.stringify(data, { lineWidth: 0 }));
  return records.length;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const { values } = parseArgs({ options: { tree: { type: 'string' }, check: { type: 'boolean', default: false } } });
  const count = syncEvidence(values);
  console.log(`${count} evidence records ${values.check ? 'match the catalogue' : 'synchronised; family tags preserved'}.`);
}
