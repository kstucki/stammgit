import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { syncEvidence } from '../../scripts/sync-evidence.mjs';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stammgit-evidence-')); roots.push(root);
  for (const directory of ['data/trees', 'docs/source-editions/belege', 'public/sources']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  const file = path.join(root, 'data/trees/demo.yaml'), url = '/sources/beleg-b000001.pdf';
  fs.writeFileSync(file, YAML.stringify({ meta: { focusPersonId: 'example' }, people: { example: { name: 'Example' } },
    sourceDetails: { [url]: { id: 'B000001', title: 'Old title', tags: ['Example family'] } } }));
  const recordFile = path.join(root, 'docs/source-editions/belege/B000001.json');
  const record = { id: 'B000001', title: 'Recorded title', citation: 'Example register, p. 3', tags: ['Ignored editorial tag'] };
  fs.writeFileSync(recordFile, JSON.stringify(record));
  fs.writeFileSync(path.join(root, 'docs/source-editions/originale.json'), '[]');
  fs.writeFileSync(path.join(root, 'public/sources/beleg-b000001.pdf'), '%PDF fixture');
  return { root, file, recordFile, record, url };
}
it('checks without writing, updates only the selected catalogue and preserves website tags', () => {
  const { root, file, url } = fixture(); const before = fs.readFileSync(file, 'utf8');
  expect(() => syncEvidence({ root, tree: 'demo', check: true })).toThrow('metadata differs');
  expect(fs.readFileSync(file, 'utf8')).toBe(before);
  expect(syncEvidence({ root, tree: 'demo' })).toBe(1);
  expect(syncEvidence({ root, tree: 'demo', check: true })).toBe(1);
  const data = YAML.parse(fs.readFileSync(file, 'utf8'));
  expect(data.sourceDetails[url]).toMatchObject({ id: 'B000001', title: 'Recorded title', tags: ['Example family'] });
  expect(data.sourceCategories[url]).toBe('belege');
  expect(data.people).toEqual({ example: { name: 'Example' } });
});
it('rejects an omitted dataset, traversal, mismatched IDs and duplicate manifests without changing YAML', () => {
  const { root, file, recordFile, record } = fixture(); const before = fs.readFileSync(file, 'utf8');
  for (const tree of ['', '../demo']) expect(() => syncEvidence({ root, tree })).toThrow('Specify a dataset');
  fs.writeFileSync(recordFile, JSON.stringify({ ...record, id: 'B000002' }));
  expect(() => syncEvidence({ root, tree: 'demo' })).toThrow('differs from filename');
  fs.writeFileSync(recordFile, JSON.stringify(record));
  fs.writeFileSync(path.join(root, 'docs/source-editions/originale.json'), JSON.stringify([{ ...record, file: 'beleg-b000001.pdf' }]));
  expect(() => syncEvidence({ root, tree: 'demo' })).toThrow('Duplicate evidence');
  expect(fs.readFileSync(file, 'utf8')).toBe(before);
});
