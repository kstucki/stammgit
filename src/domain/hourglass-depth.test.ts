import { expect, it } from 'vitest';
import type { Dataset } from './person';
import { computeHourglass, hourglassMaxDepth } from './graph/selection';
import { selectGraph } from './tree-selection';
import { expandGraph } from './graph-expansion';
import { readHourglassDepth, rememberHourglassDepth } from '../state/family';

function chain(): Dataset {
  const people: Dataset['people'] = { root: { parents: ['a1'], children: ['d1'] } };
  for (let n = 1; n <= 12; n++) {
    people[`a${n}`] = { parents: n < 12 ? [`a${n + 1}`] : [], children: [n === 1 ? 'root' : `a${n - 1}`] };
    people[`d${n}`] = { children: n < 12 ? [`d${n + 1}`] : [], parents: [n === 1 ? 'root' : `d${n - 1}`] };
  }
  return { meta: { focusPersonId: 'root' }, people };
}
it('limits both directions from generation zero and supports all known generations beyond ten', () => {
  const data = chain();
  expect(computeHourglass(data.people, 'root', 5).size).toBe(11);
  expect(computeHourglass(data.people, 'root', 5).has('a6')).toBe(false);
  expect(computeHourglass(data.people, 'root', 5).has('d6')).toBe(false);
  expect(hourglassMaxDepth(data.people, ['root'])).toBe(12);
  expect(computeHourglass(data.people, 'root', Infinity).size).toBe(25);
  const base = selectGraph(data, 'root', 'hourglass', ['root'], 5).family;
  expect(expandGraph(data, base, [{ id: 'a5', direction: 'parents' }]).people).toContain('a6');
  expect(selectGraph(data, 'root', 'hourglass', ['root'], 2).family.people).toHaveLength(5);
});
it('unites independent roots, counts partners at zero cost and preserves stepfamilies', () => {
  const data = chain();
  data.people.d1.partners = ['spouse'];
  data.people.spouse = { partners: ['d1'], children: ['step'], parents: ['outside'] };
  data.people.step = { parents: ['spouse'] };
  data.people.outside = { children: ['spouse'] };
  expect(computeHourglass(data.people, 'root', 1).has('spouse')).toBe(true);
  expect(computeHourglass(data.people, 'root', 1).has('step')).toBe(false);
  expect(computeHourglass(data.people, 'root', 2).has('step')).toBe(true);
  expect(computeHourglass(data.people, 'root', 2).has('outside')).toBe(false);
  const united = computeHourglass(data.people, ['root', 'spouse'], 1);
  expect(united.has('outside')).toBe(true);
  expect(united.has('step')).toBe(true);
  expect(united.has('a2')).toBe(false);
});
it('revisits a shared ancestor through the shorter path and terminates cycles', () => {
  const people: Dataset['people'] = {
    root: { parents: ['long', 'short'], partners: ['mate'] }, mate: { partners: ['root'] },
    long: { parents: ['middle'] }, middle: { parents: ['shared'] }, short: { parents: ['shared'] },
    shared: { parents: ['last'] }, last: { parents: ['root'] },
  };
  expect(computeHourglass(people, 'root', 3).has('last')).toBe(true);
  expect(hourglassMaxDepth(people, ['root'])).toBe(3);
  expect(computeHourglass(people, 'root').size).toBe(7);
});
it('persists finite and unlimited depth and defaults invalid values to five', () => {
  let saved: string | null = null;
  const storage = { getItem: () => saved, setItem: (_: string, value: string) => { saved = value; } };
  expect(readHourglassDepth('test', storage)).toBe(5);
  for (const depth of [2, 18, Infinity]) {
    rememberHourglassDepth('test', depth, storage);
    expect(readHourglassDepth('test', storage)).toBe(depth);
  }
  for (const invalid of ['0', '-2', 'NaN', '2.5', 'bad']) {
    saved = invalid; expect(readHourglassDepth('test', storage)).toBe(5);
  }
});
