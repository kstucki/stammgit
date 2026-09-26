import { expect, it } from 'vitest';
import type { Dataset } from '../person';
import { selectGraph } from '../tree-selection';
import { orderFamily } from '../family-layout';
import { layoutGraph } from './layout';

it('preserves the original layout exactly when there are no partnerships to repair', () => {
  const ids = ['root', 'young', 'old', 'youngChild', 'oldChild'];
  const links = [['root', 'young'], ['root', 'old'], ['young', 'youngChild'], ['old', 'oldChild']];
  const graph = { nodes: ids.map(id => ({ id, type: 'single', persons: [id] })), edges: links.map(([from, to]) => ({ from, to, dashed: false })) };
  const measure = () => ({ w: 228, h: 174 });
  expect(layoutGraph(graph, measure, null, { partners: [] })).toEqual(layoutGraph(graph, measure));
});

it('does not use birth dates to sort siblings', () => {
  const data: Dataset = { meta: { focusPersonId: 'root' }, people: {
    root: { children: ['young', 'old'] }, young: { parents: ['root'], birth: '2025' }, old: { parents: ['root'], birth: '2022' },
  } };
  const calculate = () => {
    const { family, generations } = selectGraph(data, 'root', 'descendants');
    return orderFamily(family, generations, 'typescript');
  };
  const before = calculate();
  data.people.young.birth = '1900'; data.people.old.birth = '2030';
  expect(calculate()).toEqual(before);
});

