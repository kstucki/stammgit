import { expect, it } from 'vitest';
import type { Dataset } from './person';
import { computeDescendants, computeVisible, descendantsMaxDepth } from './graph/selection';
import { selectGraph } from './tree-selection';
import { readGenerationDepth, rememberGenerationDepth } from '../state/family';

const data: Dataset = { meta: { focusPersonId: 'root' }, people: {
  root: { parents: ['ancestor'], children: ['child'] }, ancestor: { children: ['root'] },
  child: { parents: ['root'], partners: ['mate'], children: ['grandchild'] },
  mate: { partners: ['child'], parents: ['outside'], children: ['stepchild'] },
  outside: { children: ['mate'] }, stepchild: { parents: ['mate'] },
  grandchild: { parents: ['child'], children: ['greatgrandchild'] },
  greatgrandchild: { parents: ['grandchild'] },
} };

it('limits descendant steps while retaining partners and stepchildren at their own depth', () => {
  expect(computeDescendants(data.people, 'root', 1)).toEqual(new Set(['root', 'child', 'mate']));
  expect(computeDescendants(data.people, 'root', 2)).toEqual(new Set(['root', 'child', 'mate', 'grandchild', 'stepchild']));
  expect(descendantsMaxDepth(data.people, 'root')).toBe(3);
  const scene = selectGraph(data, 'root', 'descendants', ['root'], 2);
  expect(new Set(scene.family.people)).toEqual(computeDescendants(data.people, 'root', 2));
  expect(scene.family.people).not.toContain('ancestor');
  expect(scene.family.people).not.toContain('outside');
});

it('preserves the full historical descendant selection at unlimited depth', () => {
  for (const root of Object.keys(data.people)) {
    expect(computeDescendants(data.people, root)).toEqual(computeVisible(data.people, [root]));
  }
});

it('uses the shorter path, counts shared descendants once and terminates cycles', () => {
  const people: Dataset['people'] = {
    root: { children: ['long', 'short'] }, long: { children: ['middle'] },
    middle: { children: ['shared'] }, short: { partners: ['shared'] },
    shared: { partners: ['short'], children: ['last'] }, last: { children: ['root'] },
  };
  expect(computeDescendants(people, 'root', 2)).toEqual(new Set(Object.keys(people)));
  expect(descendantsMaxDepth(people, 'root')).toBe(2);
});

it('keeps depth preferences separate by view and tree, preserving existing choices', () => {
  const values = new Map<string, string>([['hourglassDepth:one', '5']]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  expect(readGenerationDepth('one', 'hourglass', storage)).toBe(5);
  expect(readGenerationDepth('one', 'descendants', storage)).toBe(3);
  rememberGenerationDepth('one', 'descendants', Infinity, storage);
  expect(readGenerationDepth('one', 'descendants', storage)).toBe(Infinity);
  expect(readGenerationDepth('two', 'descendants', storage)).toBe(3);
  expect(readGenerationDepth('one', 'hourglass', storage)).toBe(5);
  expect(readGenerationDepth('one', 'descendants', { getItem: () => { throw new Error('Unavailable'); } })).toBe(3);
});
