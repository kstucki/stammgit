import { expect, it } from 'vitest';
import YAML from 'yaml';
import type { Dataset } from '../person';
import type { LayoutNode } from './types';
import { arrangeNeighbors, compactPartnerNeighbors, type NeighborConstraints } from './neighbors';
import { familyIndex, projectFamily } from '../family';
import { orderFamily, CARD_WIDTH } from '../family-layout';

const row = (ids: string[]): LayoutNode[] => ids.map((id, i) => ({ id, type: 'single', persons: [id], w: 228, h: 174, x: i * 900, y: 20, gen: 0, desired: 0 }));
function arrange(ids: string[], rules: NeighborConstraints) {
  const nodes = row(ids);
  arrangeNeighbors(nodes, rules); compactPartnerNeighbors(nodes, rules, 28);
  return nodes;
}
it('puts an unblocked couple next to each other with a 28px gap', () => {
  const nodes = arrange(['a', 'unrelated', 'b'], { partners: [['a', 'b']] });
  const a = nodes.find(n => n.id === 'a')!, b = nodes.find(n => n.id === 'b')!;
  expect(Math.abs(nodes.indexOf(a) - nodes.indexOf(b))).toBe(1);
  expect(Math.abs(a.x - b.x)).toBe(256);
});
it('places two partners on the two sides of one person', () => {
  const nodes = arrange(['a', 'x', 'b', 'y', 'c'], { partners: [['a', 'b'], ['a', 'c']] });
  const a = nodes.find(n => n.id === 'a')!;
  for (const id of ['b', 'c']) expect(Math.abs(nodes.find(n => n.id === id)!.x - a.x)).toBe(256);
});
it('handles partner cycles deterministically without losing people', () => {
  const ids = ['a', 'x', 'b', 'y', 'c', 'z'];
  const rules: NeighborConstraints = { partners: [['a', 'x'], ['b', 'y'], ['c', 'z'], ['x', 'z']] };
  const result = arrange(ids, rules), order = result.map(n => n.id);
  expect(arrange(ids, rules)).toEqual(result);
  expect(new Set(order).size).toBe(ids.length);
  expect(result.every(n => Number.isFinite(n.x))).toBe(true);
});
it('does not change fixed generations to put a cross-generation partnership together', () => {
  const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { children: ['b'], partners: ['c'] }, b: { parents: ['a'], children: ['c'] }, c: { parents: ['b'], partners: ['a'] },
  } };
  const family = projectFamily(familyIndex(data), 'a', new Set(Object.keys(data.people)));
  const old = orderFamily(family), next = orderFamily(family, undefined, 'typescript');
  expect(next.nodes.map(n => [n.id, n.gen])).toEqual(old.nodes.map(n => [n.id, n.gen]));
  expect(next.nodes.find(n => n.id === 'c')!.gen - next.nodes.find(n => n.id === 'a')!.gen).toBe(2);
});
it('preserves all people, relationships, finite geometry and row spacing on demo and synthetic trees', () => {
  const trees = Object.values(import.meta.glob<string>('../../../data/trees/*.yaml', { eager: true, query: '?raw', import: 'default' }));
  for (const yaml of trees) {
    const data = YAML.parse(yaml) as Dataset;
    const family = projectFamily(familyIndex(data), data.meta.focusPersonId, new Set(Object.keys(data.people)));
    const before = structuredClone(family), next = orderFamily(family, undefined, 'typescript');
    expect(family).toEqual(before);
    expect(new Set(next.nodes.map(n => n.id))).toEqual(new Set(family.people));
    expect(Number.isFinite(next.width)).toBe(true);
    for (const gen of new Set(next.nodes.map(n => n.gen))) {
      const nodes = next.nodes.filter(n => n.gen === gen).sort((a, b) => a.x - b.x);
      expect(nodes.every(n => Number.isFinite(n.x))).toBe(true);
      for (let i = 1; i < nodes.length; i++) expect(nodes[i].x - nodes[i - 1].x).toBeGreaterThanOrEqual(CARD_WIDTH + 28 - 1e-7);
    }
  }
}, 120_000);

it('does not let another family’s sibling group split a couple', () => {
  const nodes = arrange(['spouse_a', 'sibling_a', 'sibling_b', 'sibling_c', 'spouse_b'], {
    partners: [['spouse_a', 'spouse_b']],
  });
  const ids = nodes.map(n => n.id);
  expect(Math.abs(ids.indexOf('spouse_a') - ids.indexOf('spouse_b'))).toBe(1);
  expect(ids.filter(id => ['sibling_a', 'sibling_b', 'sibling_c'].includes(id))).toEqual(['sibling_a', 'sibling_b', 'sibling_c']);
});
it('leaves the complete order unchanged when no partnerships are supplied', () => {
  const nodes = row(['young', 'old', 'unknown']);
  arrangeNeighbors(nodes, { partners: [] });
  expect(nodes.map(n => n.id)).toEqual(['young', 'old', 'unknown']);
});

it('moves an unrelated couple outside a sibling group without reversing siblings', () => {
  const nodes = arrange(['s1', 's2', 'partner_a', 'partner_b', 's3'], {
    partners: [['partner_a', 'partner_b']], siblingGroups: [['s3', 's1', 's2']],
  });
  expect(nodes.map(n => n.id)).toEqual(['s1', 's2', 's3', 'partner_a', 'partner_b']);
  expect(nodes.find(n => n.id === 'partner_b')!.x - nodes.find(n => n.id === 'partner_a')!.x).toBeCloseTo(256, 6);
});
it('permits a sibling’s own partner between siblings', () => {
  const nodes = arrange(['s1', 'partner', 's2', 's3'], {
    partners: [['s1', 'partner']], siblingGroups: [['s1', 's2', 's3']],
  });
  expect(nodes.map(n => n.id)).toEqual(['s1', 'partner', 's2', 's3']);
});
it('does not transfer a split to another sibling group or split another couple', () => {
  const ids = ['a', 'p', 'q', 'b', 'r', 's'];
  const rules: NeighborConstraints = { partners: [['p', 'q'], ['r', 's']], siblingGroups: [['a', 'b'], ['p', 'r']] };
  const result = arrange(ids, rules), order = result.map(n => n.id);
  expect(order).toEqual(['a', 'b', 'p', 'q', 'r', 's']);
  expect(arrange(ids, rules)).toEqual(result);
});
