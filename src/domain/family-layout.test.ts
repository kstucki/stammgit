import { expect, it } from 'vitest';
import { computeGenerations } from '../../public/assets/graph.js';
import { orderFamily, layoutFamily, childPath, familyBridgePath, CARD_WIDTH, CARD_HEIGHT } from './family-layout';
import { familyIndex, selectFamily, projectFamily } from './family';
import type { FamilySlice } from './family';
import type { FamilyLayout } from './family-layout';
import type { Dataset } from './person';
import { childConnection } from './relationship-view';

// Independent order check for the shared child stems, not layoutGraph's
// parent-edge inversion counter. Shared origins/destinations are not crossings.
function stemCrossings(family: FamilySlice, layout: FamilyLayout): number {
  const edges = family.groups.flatMap(group => group.children.map(child => ({
    group: group.id, child, from: layout.anchors.get(group.id)!, to: layout.people.get(child)!,
  })));
  let count = 0;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = edges[i], b = edges[j];
    if (a.group !== b.group && a.child !== b.child && a.to.y === b.to.y && a.from.y < a.to.y && b.from.y < b.to.y
      && (a.from.x - b.from.x) * (a.to.x - b.to.x) < 0) count++;
  }
  return count;
}

it('lays out only the selected neighborhood, with one non-overlapping card per identity', () => {
  const dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { parents: ['p'], partners: ['b'], children: ['c'] },
    p: { children: ['a'] }, b: { partners: ['a'], children: ['c'] }, c: { parents: ['a', 'b'] }, outside: {},
  } };
  const family = selectFamily(familyIndex(dataset), 'a');
  const layout = layoutFamily(family);
  expect([...layout.people.keys()].sort()).toEqual(['a', 'b', 'c', 'p']);
  for (const [id, point] of layout.people) {
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x + CARD_WIDTH).toBeLessThanOrEqual(layout.width);
    expect(point.y + CARD_HEIGHT).toBeLessThanOrEqual(layout.height);
    for (const [other, q] of layout.people) {
      if (other !== id) expect(Math.abs(point.x - q.x) >= CARD_WIDTH || Math.abs(point.y - q.y) >= CARD_HEIGHT).toBe(true);
    }
  }
  expect(layout.anchors.size).toBe(family.groups.length);
  expect(layoutFamily(family)).toEqual(layout);
});

it('orders a multi-partner and half-sibling family without crossing child stems', () => {
  const data: Dataset = { meta: { focusPersonId: 'lea' }, people: {
    lea: { parents: ['p1', 'p2'], partners: ['old', 'next'], children: ['child_old', 'child_next', 'child_solo'] },
    p1: { children: ['lea', 'sibling', 'half'] }, p2: { children: ['lea', 'sibling'] }, p3: { children: ['half'] },
    sibling: { parents: ['p1', 'p2'] }, half: { parents: ['p1', 'p3'] },
    old: { partners: ['lea'], children: ['child_old'] }, next: { partners: ['lea'], children: ['child_next'] },
    child_old: { parents: ['lea', 'old'] }, child_next: { parents: ['lea', 'next'] }, child_solo: { parents: ['lea'] }, separate: {},
  } };
  const family = selectFamily(familyIndex(data), 'lea'), original = structuredClone(family);
  const layout = layoutFamily(family);
  expect(stemCrossings(family, layout)).toBe(0);
  expect(layout.people.size).toBe(11);
  expect(family).toEqual(original);
  expect(layoutFamily(family)).toEqual(layout);
  // The optimizer may move people, but cannot reassign a child to a new pair.
  expect(family.groups.find(group => group.adults.join(',') === 'lea,old')?.children).toEqual(['child_old']);
});

it('starts a single child stem at the exact center of the two-parent connection', () => {
  const data: Dataset = { meta: { focusPersonId: 'child' }, people: {
    a: { children: ['child'] }, b: { children: ['child'] }, child: { parents: ['a', 'b'] },
  } };
  const family = selectFamily(familyIndex(data), 'child'), layout = layoutFamily(family), group = family.groups[0];
  expect(group.partnership).toBe(false); // The bridge is not a claim of marriage.
  const anchor = layout.anchors.get(group.id)!;
  expect(anchor.x).toBe((layout.people.get('a')!.x + layout.people.get('b')!.x + CARD_WIDTH) / 2);
  expect(familyBridgePath(layout, group.id, group.adults)).toContain(`${anchor.x} ${anchor.y}`);
  expect(childPath(layout, group.id, 'child')).toMatch(new RegExp(`^M ${anchor.x} ${anchor.y} C `));
  expect(childPath(layout, group.id, 'child').match(/M /g)).toHaveLength(1);
});

it('starts at the sole known parent without a fake partner bridge', () => {
  const data: Dataset = { meta: { focusPersonId: 'child' }, people: { a: { children: ['child'] }, child: { parents: ['a'] } } };
  const family = selectFamily(familyIndex(data), 'child'), layout = layoutFamily(family), group = family.groups[0];
  const a = layout.people.get('a')!;
  expect(layout.anchors.get(group.id)).toEqual({ x: a.x + CARD_WIDTH / 2, y: a.y + CARD_HEIGHT });
  expect(familyBridgePath(layout, group.id, group.adults)).toBe('');
});

it('reserves space and connects to the actual bottom of tall cards without reordering people', () => {
  const data: Dataset = { meta: { focusPersonId: 'child' }, people: { a: { children: ['child'] }, child: { parents: ['a'] } } };
  const family = selectFamily(familyIndex(data), 'child'), before = layoutFamily(family);
  const after = layoutFamily(family, new Map([['a', 360]]));
  expect(after.people.get('a')!.x).toBe(before.people.get('a')!.x);
  expect(after.anchors.get(family.groups[0].id)!.y).toBe(after.people.get('a')!.y + 360);
  expect(after.people.get('child')!.y).toBeGreaterThan(after.people.get('a')!.y + 360 + 80);
  expect(after.height).toBeGreaterThan(before.height);
});

it('keeps the shared stem neutral for mixed types and names only the actual special parent', () => {
  const data: Dataset = { meta: { focusPersonId: 'child' }, people: {
    a: {}, b: {}, child: { parents: ['a', 'b'], parentDetails: { a: { type: 'adoptive' } } },
  } };
  expect(childConnection(data, ['a', 'b'], 'child')).toEqual({ style: 'default', annotations: [{ parent: 'a', style: 'adoptive' }] });
  data.people.child.parentDetails!.b = { type: 'adoptive' };
  expect(childConnection(data, ['a', 'b'], 'child')).toEqual({ style: 'adoptive', annotations: [] });
  data.people.child.parentDetails = { a: { type: 'biological' } };
  expect(childConnection(data, ['a', 'b'], 'child')).toEqual({ style: 'default', annotations: [] });
});

it('keeps ancestry levels despite marriage, using longest paths only for conflicting parent routes', () => {
  // One branch reaches a partner in two generations, the other in three.
  const data: Dataset = { meta: { focusPersonId: 'root' }, people: {
    root: { children: ['a', 'b'] }, a: { parents: ['root'], children: ['wife'] },
    b: { parents: ['root'], children: ['c'] }, c: { parents: ['b'], children: ['husband'] },
    wife: { parents: ['a'], partners: ['husband'], children: ['child'] },
    husband: { parents: ['c'], partners: ['wife'], children: ['child'] }, child: { parents: ['wife', 'husband'] },
  } };
  const family = projectFamily(familyIndex(data), 'root', new Set(Object.keys(data.people)));
  for (const center of Object.keys(data.people)) {
    const preferred = computeGenerations(data.people, new Set(family.people), center);
    const order = orderFamily(family, preferred);
    const levels = new Map(order.nodes.map(node => [node.id, node.gen]));
    expect(levels.get('wife')! - levels.get('root')!).toBe(2);
    expect(levels.get('husband')! - levels.get('root')!).toBe(3);
    expect(levels.get('child')! - levels.get('root')!).toBe(4);
    for (const [child, person] of Object.entries(data.people)) for (const parent of person.parents || []) expect(levels.get(child)!).toBeGreaterThan(levels.get(parent)!);
    expect(order.nodes).toHaveLength(7);
  }
});

function levels(data: Dataset, center = data.meta.focusPersonId) {
  const family = projectFamily(familyIndex(data), center, new Set(Object.keys(data.people)));
  return new Map(orderFamily(family, computeGenerations(data.people, new Set(family.people), center)).nodes.map(n => [n.id, n.gen]));
}

it('keeps sisters together and places an ancestry-free spouse beside them from every center', () => {
  const data: Dataset = { meta: { focusPersonId: 'sister' }, people: {
    parent: {}, sister: { parents: ['parent'], partners: ['other'] }, other: { partners: ['sister'] },
    branch_a: { parents: ['parent'], partners: ['spouse_a'] }, spouse_a: { partners: ['branch_a'] },
    child: { parents: ['branch_a', 'spouse_a'] }, grandchild: { parents: ['child'] },
  } };
  const before = structuredClone(data);
  for (const center of Object.keys(data.people)) {
    const g = levels(data, center);
    expect(g.get('branch_a')).toBe(g.get('sister'));
    expect(g.get('spouse_a')).toBe(g.get('branch_a'));
    expect(g.get('other')).toBe(g.get('sister'));
    for (const [child, person] of Object.entries(data.people)) for (const parent of person.parents || [])
      expect(g.get(child)! - g.get(parent)!).toBe(1);
  }
  expect(data).toEqual(before);
});

it('allows marriage across fixed generations without moving siblings or requiring a shared child', () => {
  const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
    root: {}, a: { parents: ['root'], partners: ['b'] }, sister: { parents: ['root'] },
    middle: { parents: ['root'] }, b: { parents: ['middle'], partners: ['a'] },
  } };
  const g = levels(data);
  expect(g.get('a')).toBe(g.get('sister'));
  expect(g.get('b')! - g.get('a')!).toBe(1);
});

it('ignores only the annotated social parent edge, including mixed parent families', () => {
  const data: Dataset = { meta: { focusPersonId: 'root' }, people: {
    root: {}, biological: { parents: ['root'] }, sibling: { parents: ['root'] },
    child: { parents: ['biological', 'root'], parentDetails: { root: { type: 'adoptive' } } },
  } };
  const g = levels(data);
  expect(g.get('biological')).toBe(g.get('sibling'));
  expect(g.get('child')! - g.get('biological')!).toBe(1);
  expect(g.get('child')! - g.get('root')!).toBe(2);
  const family = projectFamily(familyIndex(data), 'root', new Set(Object.keys(data.people)));
  expect(family.groups.some(group => group.adults.includes('root') && group.children.includes('child'))).toBe(true);
});

it('does not force separate ancestry lines of different depths to start at the same height', () => {
  const data: Dataset = { meta: { focusPersonId: 'child' }, people: {
    root: {}, a: { parents: ['root'] }, b: { parents: ['a'] }, other: {}, child: { parents: ['b', 'other'] },
  } };
  const g = levels(data);
  expect(g.get('other')).toBe(g.get('b'));
  expect(g.get('child')! - g.get('other')!).toBe(1);
});

it('keeps every card finite even for invalid ancestry cycles', () => {
  const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { parents: ['b'] }, b: { parents: ['a'] }, c: { parents: ['b'] },
  } };
  const g = levels(data);
  expect(g.size).toBe(3);
  expect([...g.values()].every(Number.isFinite)).toBe(true);
});
