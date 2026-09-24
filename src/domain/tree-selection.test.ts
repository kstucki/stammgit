import { expect, it } from 'vitest';
import { selectGraph } from './tree-selection';
import type { Dataset } from './person';
import { compactScene } from '../testing/compact';
import { getT } from '../../public/assets/strings.js';

const data: Dataset = { meta: { focusPersonId: 'c' }, people: {
  a: { children: ['c', 's'], partners: ['b', 'other'] }, b: { children: ['c', 's'], partners: ['a'] },
  c: { parents: ['a', 'b'], children: ['d'] }, s: { parents: ['a', 'b'] }, d: { parents: ['c'] },
  other: { partners: ['a'], parents: ['outside'] }, outside: { children: ['other'] }, z: {},
} };
const members = (mode: Parameters<typeof selectGraph>[2], roots?: string[]) => selectGraph(data, 'c', mode, roots).family.people;

it('keeps the family neighborhood distinct from hourglass, descendants, ancestors selection', () => {
  expect(members('family')).toEqual(['a', 'b', 'c', 'd', 's']);
  expect(members('hourglass')).toEqual(['a', 'b', 'c', 'd', 'other']);
  expect(members('descendants')).toEqual(['c', 'd']);
  expect(members('ancestors')).toEqual(['a', 'b', 'c']);
  for (const mode of ['hourglass', 'descendants'] as const) {
    const old = compactScene(data, { title: 'Test' }, 'test', mode, ['c'], mode === 'descendants' ? 'c' : null, getT('de'));
    expect(members(mode)).toEqual(old.nodes.flatMap(node => node.persons).sort());
  }
});

it('projects every parent family and partnership once without adding people or changing relationships', () => {
  const original = structuredClone(data);
  const family = selectGraph(data, 'c', 'hourglass').family;
  expect(family.groups.map(group => [group.adults, group.children, group.partnership])).toEqual([
    [['a', 'b'], ['c'], true], [['a', 'other'], [], true], [['c'], ['d'], false],
  ]);
  expect(data).toEqual(original);
  expect(new Set(family.people).size).toBe(family.people.length);
  // As an explicit root, 'other' brings its partner's children (including s).
  expect(members('hourglass', ['c', 'other'])).toEqual(['a', 'b', 'c', 'd', 'other', 'outside', 's']);
});

it('ancestors traverse all documented parent types and stop on cycles and repeated ancestors', () => {
  const multi: Dataset = { meta: { focusPersonId: 'c' }, people: {
    c: { parents: ['a', 'b', 'd'], parentGroups: [['a', 'b'], ['d']], parentDetails: { a: { type: 'biological' }, d: { type: 'adoptive' } } },
    a: { parents: ['g'] }, b: { parents: ['g'] }, d: {}, g: { parents: ['c'] }, isolated: {},
  } };
  const scene = selectGraph(multi, 'c', 'ancestors');
  expect(scene.family.people).toEqual(['a', 'b', 'c', 'd', 'g']);
  expect(scene.family.groups.filter(group => group.children.includes('c')).map(group => group.adults)).toEqual([['a', 'b'], ['d']]);
});
