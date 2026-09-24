import { expect, it } from 'vitest';
import { compactScene } from '../testing/compact';
import { getT } from '../../public/assets/strings.js';
import { buildFamGraph, computeGenerations, layoutGraph } from '../../public/assets/graph.js';
import type { Dataset } from './person';
const data: Dataset = { meta: { focusPersonId: 'c' }, people: {
  a: { name: 'A', children: ['c', 's'], partners: ['b'] }, b: { name: 'B', children: ['c', 's'], partners: ['a'] },
  c: { name: 'C', parents: ['a', 'b'], children: ['d'] }, s: { name: 'S', parents: ['a', 'b'] }, d: { name: 'D', parents: ['c'] }, z: { name: 'Z' },
} };
const config = { title: 'Test' }, t = getT('de');
it('keeps the compact hourglass scope and original layout coordinates', () => {
  const scene = compactScene(data, config, 'demo', 'hourglass', [], null, t);
  const expected = new Set(['a', 'b', 'c', 'd']);
  expect(new Set(scene.nodes.flatMap(n => n.persons))).toEqual(expected);
  const old = layoutGraph(buildFamGraph(data.people, expected, {}), (n: { persons: string[] }) => ({ w: 6 * 7.6 + 48, h: n.persons.length * 17 + 16 }), computeGenerations(data.people, expected, 'c'));
  expect(scene.nodes).toEqual(old.nodes); expect([scene.width, scene.height]).toEqual([old.width, old.height]);
});
it('keeps descendant scope distinct from hourglass', () => {
  expect(new Set(compactScene(data, config, 'demo', 'descendants', [], 'c', t).nodes.flatMap(n => n.persons))).toEqual(new Set(['c', 'd']));
});
