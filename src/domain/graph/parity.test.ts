import { expect, it } from 'vitest';
import YAML from 'yaml';
import type { Dataset } from '../person';
import type { LayoutGraph } from './types';
import { layoutGraph } from './layout';
import * as selection from './selection';
import * as legacy from '../../../public/assets/graph.js';
import { selectGraph } from '../tree-selection';
import { consistentGenerations } from '../family-layout';
import { selectConnections } from '../connections';
import type { FamilySlice } from '../family';

const datasets = Object.entries(import.meta.glob<string>([
  '../../../tests/fixtures/archive/data/trees/*.yaml', '../../../data/trees/*.yaml',
], { eager: true, query: '?raw', import: 'default' })).map(([path, yaml]) => [path, YAML.parse(yaml) as Dataset] as const);
const measure = () => ({ w: 228, h: 174 });
function graph(family: FamilySlice): LayoutGraph {
  return {
    nodes: family.people.map(id => ({ id, type: 'single', persons: [id] })),
    edges: family.groups.flatMap(group => group.children.flatMap(to => group.adults.filter(from => from !== to).map(from => ({ from, to, dashed: false })))),
    rings: family.groups.filter(g => g.adults.length === 2).map(g => ({ id: g.id, a: g.adults[0], b: g.adults[1], na: g.adults[0], nb: g.adults[1] })),
  };
}
it.each(datasets)('preserves selection and preferred generations: %s', (_, data) => {
  for (const root of Object.keys(data.people)) {
    const visible = selection.computeHourglass(data.people, root);
    expect(visible).toEqual(legacy.computeHourglass(data.people, root));
    expect(selection.computeVisible(data.people, [root])).toEqual(legacy.computeVisible(data.people, [root]));
    expect(selection.computeGenerations(data.people, visible, root)).toEqual(legacy.computeGenerations(data.people, visible, root));
    expect(selection.findAnchors(data.people, visible)).toEqual(legacy.findAnchors(data.people, visible));
  }
  const roots = Object.keys(data.people).slice(0, 3);
  expect(selection.computeHourglass(data.people, roots)).toEqual(legacy.computeHourglass(data.people, roots));
  expect(selection.computeVisible(data.people, roots, new Set(roots), { includeOrphans: true }))
    .toEqual(legacy.computeVisible(data.people, roots, new Set(roots), { includeOrphans: true }));
});
it.each(datasets)('preserves every coordinate for all five views: %s', (_, data) => {
  const root = data.meta.focusPersonId;
  const scenes = (['family', 'hourglass', 'descendants', 'ancestors'] as const).map(mode => selectGraph(data, root, mode));
  const targets = [root, ...Object.keys(data.people).filter(id => id !== root).slice(-2)];
  const family = selectConnections(data, targets).family;
  if (family) scenes.push({ family, generations: selection.computeGenerations(data.people, new Set(family.people), root) });
  for (const scene of scenes) {
    const input = graph(scene.family), before = structuredClone(input);
    const levels = consistentGenerations(scene.family, scene.generations ?? new Map());
    expect(layoutGraph(input, measure, levels)).toEqual(legacy.layoutGraph(structuredClone(input), measure, levels));
    expect(input).toEqual(before);
  }
}, 120_000);
it('preserves thresholds, variable widths, fallback generations and disconnected components', () => {
  for (const count of [1, 18, 91, 151, 601]) {
    const input: LayoutGraph = { nodes: [], edges: [], rings: [] };
    for (let i = 0; i < count; i++) {
      input.nodes.push({ id: String(i), persons: [String(i)], type: 'single' });
      if (i > 0 && i % 7) input.edges.push({ from: String(i - 1), to: String(i), dashed: false });
    }
    const sizes = (node: { id: string }) => ({ w: 120 + Number(node.id) % 3 * 20, h: 90 });
    expect(layoutGraph(input, sizes)).toEqual(legacy.layoutGraph(structuredClone(input), sizes));
  }
}, 120_000);
