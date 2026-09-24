import { expect, it } from 'vitest';
import type { Dataset } from './person';
import { familyIndex, projectFamily } from './family';
import { selectConnections, simplePathEdges } from './connections';
const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
  a: { partners: ['b'], parents: ['s'] }, b: { partners: ['a'] },
  child: { parents: ['a', 'b'], parentDetails: { a: { type: 'adoptive' } } },
  s: { children: ['a'], partners: ['t'] }, t: { partners: ['s'], children: ['b'] },
  leaf: { parents: ['child'] }, alone: {},
} };
// Add a longer independent route a–s–t–b using a recorded parent edge.
data.people.b.parents = ['t'];
it('family paths keep marriage and longer routes while hiding an unselected child', () => {
  const before = structuredClone(data);
  const scene = selectConnections(data, ['a', 'b', 'a', 'missing']);
  expect(scene.selected).toEqual(['a', 'b']);
  expect(scene.family?.people).toEqual(['a', 'b', 's', 't']);
  expect(scene.edges).toHaveLength(4);
  expect(scene.edges).not.toContainEqual({ a: 'a', b: 'child', kind: 'parent' });
  expect(scene.family?.groups.find(g => g.adults.join() === 'a,b')).toMatchObject({ partnership: true, children: [] });
  expect(data).toEqual(before);
});
it('keeps disconnected terminals, supports empty and single selections and removal to intermediate', () => {
  expect(selectConnections(data, []).family).toBeNull();
  expect(selectConnections(data, ['a']).family?.people).toEqual(['a']);
  const scene = selectConnections(data, ['a', 'b', 'alone']);
  expect(scene.components).toEqual([['a', 'b'], ['alone']]);
  expect(scene.family?.people).toContain('alone');
  expect(selectConnections(data, ['a', 'b', 'child']).family?.people).toContain('child');
  expect(selectConnections(data, ['a', 'b']).family?.people).not.toContain('child');
});
it('does not invent marriage for co-parents or sibling shortcuts for shared parents', () => {
  const scene = selectConnections({ meta: { focusPersonId: 'a' }, people: {
    a: {}, b: {}, child: { parents: ['a', 'b'] }, sibling: { parents: ['a'] },
  } }, ['a', 'b']);
  expect(scene.edges).toEqual([]);
  expect(scene.family?.people).toEqual(['a', 'b']);
  expect(scene.family?.groups).toHaveLength(1);
  expect(scene.family?.groups[0]).toMatchObject({ adults: ['a', 'b'], children: [] });
  expect(scene.family?.groups[0].partnership).toBe(false);
});
it('matches exhaustive simple-path enumeration on every undirected five-person graph', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const possible = ids.flatMap((a, i) => ids.slice(i + 1).map(b => [a, b]));
  for (let mask = 0; mask < 1 << possible.length; mask++) {
    const links = possible.filter((_, bit) => mask & (1 << bit));
    const sample: Dataset = { meta: { focusPersonId: 'a' }, people: Object.fromEntries(ids.map(id => [id, {
      partners: links.filter(pair => pair.includes(id)).map(pair => pair.find(other => other !== id)!),
    }])) };
    for (const terminals of [['a', 'b'], ['a', 'c', 'e']]) {
      const expected = new Set<string>();
      const visit = (path: string[], target: string) => {
        const last = path[path.length - 1];
        if (last === target) {
          for (let i = 1; i < path.length; i++) expected.add([path[i-1], path[i]].sort().join(':'));
          return;
        }
        for (const next of sample.people[last].partners!) if (!path.includes(next)) visit([...path, next], target);
      };
      terminals.forEach((a, i) => terminals.slice(i + 1).forEach(b => visit([a], b)));
      const scene = selectConnections(sample, terminals);
      expect(new Set(scene.edges.map(edge => [edge.a, edge.b].sort().join(':'))), `graph ${mask}, ${terminals}`).toEqual(expected);
    }
  }
});
it('has no depth cutoff and handles long chains without recursive stack exhaustion', () => {
  const people = Object.fromEntries(Array.from({ length: 12000 }, (_, i) => [String(i), { parents: i ? [String(i-1)] : [] }]));
  // Selection/projection is also read-only for a deep genealogy.
  expect(selectConnections({ meta: { focusPersonId: '0' }, people }, ['0', '11999']).edges).toHaveLength(11999);
});
it('retains different recorded relationship types between the same two people', () => {
  const scene = selectConnections({ meta: { focusPersonId: 'a' }, people: {
    a: { partners: ['b'], parents: ['b'] }, b: { partners: ['a'], children: ['a'] },
  } }, ['a', 'b']);
  expect(scene.edges).toHaveLength(2);
  expect(scene.edges.map(edge => edge.kind).sort()).toEqual(['parent', 'partner']);
});

it('adds no sibling shortcuts or duplicate lines beyond the former full projection', () => {
  const sample: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { partners: ['b'], siblings: ['b', 'alone'] }, b: { partners: ['a'], siblings: ['a'] },
    child: { parents: ['a', 'b'] }, alone: { siblings: ['a'] },
  } };
  const full = projectFamily(familyIndex(sample), 'a', new Set(Object.keys(sample.people)));
  const scene = selectConnections(sample, ['a', 'b']);
  expect(scene.edges).toHaveLength(1);
  expect(scene.family?.people).toEqual(['a', 'b']);
  expect(scene.family?.groups).toEqual(full.groups.map(group => ({ ...group, children: [] })));
  expect(new Set(scene.family?.groups.map(group => group.id)).size).toBe(scene.family?.groups.length);
  expect(selectConnections(sample, ['a', 'alone']).components).toEqual([['a'], ['alone']]);
  expect(selectConnections(sample, ['a', 'alone']).family?.groups).toEqual([]);
});

it('prunes only leaves of the generated family graph and keeps selected children or further connections', () => {
  const before = structuredClone(data);
  // The stored child has an offspring, but it is outside this generated graph.
  expect(selectConnections(data, ['a', 'b']).family?.people).toEqual(['a', 'b', 's', 't']);
  expect(selectConnections(data, ['a', 'b', 'child']).family?.people).toContain('child');
  const withOffspring = selectConnections(data, ['a', 'leaf']);
  expect(withOffspring.family?.people).toContain('child');
  expect(withOffspring.family?.people).toContain('leaf');
  expect(data).toEqual(before);
});
it('keeps a child connecting two parent families, including adoption', () => {
  const sample: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { partners: ['b'] }, b: { partners: ['a'] }, c: { partners: ['d'] }, d: { partners: ['c'] },
    child: { parents: ['a', 'b', 'c', 'd'], parentGroups: [['a', 'b'], ['c', 'd']], parentDetails: { c: { type: 'adoptive' }, d: { type: 'adoptive' } } },
  } };
  const scene = selectConnections(sample, ['a', 'c']);
  expect(scene.family?.people).toContain('child');
  expect(scene.family?.groups.filter(group => group.children.includes('child'))).toHaveLength(2);
});

const loop: Dataset = { meta: { focusPersonId: 'h' }, people: {
  h: { partners: ['i'] }, i: { partners: ['h'], parents: ['m'] },
  e: { parents: ['h', 'i'], partners: ['u'] }, d: { parents: ['h', 'i'] },
  u: { partners: ['e', 'c'] }, c: { partners: ['u'], parents: ['m'] }, m: {},
} };
it('removes a loop attached only at one family point without restoring its child stem', () => {
  const before = structuredClone(loop), scene = selectConnections(loop, ['h', 'd']);
  expect(scene.family?.people).toEqual(['d', 'h', 'i']);
  expect(scene.family?.groups).toEqual([{ id: '["h","i"]', adults: ['h', 'i'], children: ['d'], partnership: true }]);
  expect(scene.family?.generationParents).toEqual([{ parent: 'h', child: 'd' }, { parent: 'i', child: 'd' }]);
  expect(loop).toEqual(before);
});
it('keeps both directions through a loop when a person inside is selected', () => {
  const scene = selectConnections(loop, ['h', 'd', 'c']);
  expect(scene.family?.people).toEqual(['c', 'd', 'e', 'h', 'i', 'm', 'u']);
  expect(scene.family?.groups.find(g => g.id === '["h","i"]')?.children).toEqual(['d', 'e']);
});
it('keeps a loop with a second connection to the required graph', () => {
  const data = structuredClone(loop);
  data.people.d.partners = ['c']; data.people.c.partners!.push('d');
  expect(selectConnections(data, ['h', 'd']).family?.people).toEqual(['c', 'd', 'e', 'h', 'i', 'm', 'u']);
});
it('keeps documented parents for a sibling path without re-expanding their families', () => {
  const data = structuredClone(loop);
  data.people.e.partners = []; data.people.u.partners = ['c'];
  const scene = selectConnections(data, ['e', 'd']);
  expect(scene.family?.people).toEqual(['d', 'e', 'h', 'i']);
  expect(scene.family?.groups).toHaveLength(1);
  expect(scene.family?.groups[0].children).toEqual(['d', 'e']);
});
it('matches exhaustive simple paths on every three-person, three-family incidence graph', () => {
  const ids = ['a', 'b', 'c', 'f1', 'f2', 'f3'];
  const possible = ids.slice(0, 3).flatMap(p => ids.slice(3).map(f => [p, f] as [string, string]));
  for (let mask = 0; mask < 512; mask++) {
    const pairs = possible.filter((_, i) => mask & (1 << i));
    for (const terminals of [['a', 'b'], ['a', 'b', 'c']]) {
      const expected = new Set<number>();
      const visit = (path: string[], used: number[], target: string) => {
        const last = path.at(-1)!;
        if (last === target) { used.forEach(edge => expected.add(edge)); return; }
        pairs.forEach(([a, b], i) => {
          const next = a === last ? b : b === last ? a : undefined;
          if (next && !path.includes(next)) visit([...path, next], [...used, i], target);
        });
      };
      terminals.forEach((a, i) => terminals.slice(i + 1).forEach(b => visit([a], [], b)));
      expect(simplePathEdges(ids, pairs, terminals).retained, `mask ${mask}, ${terminals}`).toEqual(expected);
    }
  }
});
