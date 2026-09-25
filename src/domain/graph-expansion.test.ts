import { expect, it } from 'vitest';
import { expandGraph, hiddenRelatives } from './graph-expansion';
import { selectConnections } from './connections';
import { selectGraph } from './tree-selection';
import type { Dataset } from './person';
const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
  grand: { children: ['parent'] }, parent: { parents: ['grand'], children: ['a'] },
  a: { parents: ['parent'], partners: ['b', 'other'], children: ['child'] },
  b: { partners: ['a'], children: ['child'] }, other: { partners: ['a'] },
  child: { parents: ['a', 'b'], children: ['leaf'], parentDetails: { a: { type: 'adoptive' } } },
  leaf: { parents: ['child'] }, isolated: {},
} };
it('reports only hidden documented direct relatives, including adoption', () => {
  const base = selectConnections(data, ['a']).family!;
  expect(hiddenRelatives(data, base).get('a')).toEqual({ parents: ['parent'], children: ['child'], partners: ['b', 'other'] });
  const all = selectGraph(data, 'a', 'hourglass').family;
  expect(hiddenRelatives(data, all).get('a')).toEqual({ parents: [], children: [], partners: [] });
});
it('opens precisely one step and keeps data, center and base memberships intact', () => {
  const original = JSON.stringify(data), base = selectConnections(data, ['a', 'b']).family!;
  const result = expandGraph(data, base, [{ id: 'a', direction: 'children' }]);
  expect(result.people).toEqual(['a', 'b', 'child']);
  expect(result.center).toBe(base.center);
  expect(result.groups).toEqual([{ id: '["a","b"]', adults: ['a', 'b'], children: ['child'], partnership: true }]);
  expect(result.generationParents).toEqual([{ parent: 'b', child: 'child' }]);
  expect(hiddenRelatives(data, result).get('child')?.children).toEqual(['leaf']);
  expect(expandGraph(data, result, [{ id: 'a', direction: 'children' }])).toEqual(result);
  expect(base.people).toEqual(['a', 'b']);
  expect(JSON.stringify(data)).toBe(original);
});
it('parent and partner expansion do not pull in their other relatives', () => {
  const base = selectConnections(data, ['child']).family!;
  const parents = expandGraph(data, base, [{ id: 'child', direction: 'parents' }]);
  expect(parents.people).toEqual(['a', 'b', 'child']);
  expect(parents.groups[0].adults).toEqual(['a', 'b']);
  const expanded = expandGraph(data, parents, [{ id: 'a', direction: 'partners' }]);
  expect(expanded.people).toEqual(['a', 'b', 'child', 'other']);
  expect(expanded.groups.find(g => g.adults.includes('other'))?.children).toEqual([]);
});
it('does not reintroduce discarded child memberships between already visible people', () => {
  const d: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { partners: ['b'], children: ['c'] }, b: { partners: ['a'], children: ['c'] },
    c: { parents: ['a', 'b'], partners: ['x'] }, x: { partners: ['c', 'a'] },
  } };
  // Base keeps visible c but intentionally excludes its child membership.
  const full = selectGraph(d, 'a', 'hourglass').family;
  const base = { ...full, people: ['a', 'b', 'c'], groups: full.groups.filter(g => !g.adults.includes('x')).map(g => ({ ...g, children: [] })), generationParents: [] };
  const result = expandGraph(d, base, [{ id: 'c', direction: 'partners' }]);
  expect(result.people).toContain('x');
  expect(result.groups.flatMap(g => g.children)).toEqual([]);
  expect(result.groups.some(g => g.adults.includes('a') && g.adults.includes('x'))).toBe(false);
});
it('all regular modes can be extended without losing their original graph', () => {
  for (const mode of ['family', 'ancestors', 'descendants', 'hourglass'] as const) {
    const base = selectGraph(data, 'child', mode).family;
    const result = expandGraph(data, base, [{ id: 'a', direction: 'partners' }, { id: 'child', direction: 'children' }]);
    expect(base.people.every(id => result.people.includes(id))).toBe(true);
    expect(result.people.length).toBe(new Set(result.people).size);
    for (const group of base.groups) expect(result.groups.find(g => g.id === group.id)?.children).toEqual(expect.arrayContaining(group.children));
  }
});
