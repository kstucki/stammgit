import { describe, expect, it } from 'vitest';
import { familyIndex, selectFamily, familyKey, siblingsFor } from './family';
import type { Dataset } from './person';

const fixture = (): Dataset => ({ meta: { focusPersonId: 'a' }, people: {
  a: { partners: ['b', 'c'], children: ['ab', 'ac', 'solo'] },
  b: { partners: ['a'], children: ['ab'] }, c: { partners: ['a'], children: ['ac'] },
  ab: { parents: ['a', 'b'] }, ac: { parents: ['a', 'c'] }, solo: { parents: ['a'] },
  isolated: {},
} });

describe('the recorded family neighborhood', () => {
  it('keeps each partnership and child attached to the recorded parents', () => {
    const data = fixture();
    const family = selectFamily(familyIndex(data), 'a');
    expect(family.people).toEqual(['a', 'ab', 'ac', 'b', 'c', 'solo']);
    const byAdults = new Map(family.groups.map(group => [group.id, group]));
    expect(byAdults.get(familyKey(['a', 'b']))?.children).toEqual(['ab']);
    expect(byAdults.get(familyKey(['a', 'c']))?.children).toEqual(['ac']);
    expect(byAdults.get(familyKey(['a']))?.children).toEqual(['solo']);
    expect(byAdults.get(familyKey(['a']))?.partnership).toBe(false);
    data.people.a.partners!.reverse();
    expect(selectFamily(familyIndex(data), 'a')).toEqual(family);
  });
  it('does not move existing children when another partnership is recorded', () => {
    const data = fixture();
    const before = selectFamily(familyIndex(data), 'a');
    data.people.d = { partners: ['a'] }; data.people.a.partners!.push('d');
    const after = selectFamily(familyIndex(data), 'a');
    for (const group of before.groups) expect(after.groups.find(candidate => candidate.id === group.id)).toEqual(group);
    expect(after.groups.find(group => group.id === familyKey(['a', 'd']))?.children).toEqual([]);
  });
  it('records the shared parent without claiming full biological knowledge', () => {
    expect(siblingsFor(familyIndex(fixture()), 'ab')).toEqual([
      { id: 'ac', sharedParents: ['a'] }, { id: 'solo', sharedParents: ['a'] },
    ]);
  });
  it('keeps an explicitly recorded sibling without inventing a parent', () => {
    const data = fixture(); data.people.isolated.siblings = ['a'];
    const family = selectFamily(familyIndex(data), 'a');
    expect(family.siblings).toEqual([{ id: 'isolated', sharedParents: [] }]);
    expect(family.groups.every(group => !group.children.includes('isolated'))).toBe(true);
  });
  it('does not turn a co-parent family into a partnership', () => {
    const data = fixture(); delete data.people.a.partners; delete data.people.b.partners; delete data.people.c.partners;
    expect(selectFamily(familyIndex(data), 'a').groups.every(group => !group.partnership)).toBe(true);
  });
  it('shows multiple untyped parents as unresolved individual links, never arbitrary pairs', () => {
    const data: Dataset = { meta: { focusPersonId: 'child' }, people: {
      child: { parents: ['p1', 'p2', 'p3'] }, p1: { children: ['child'] }, p2: { children: ['child'] }, p3: { children: ['child'] },
    } };
    const family = selectFamily(familyIndex(data), 'child');
    expect(family.groups.map(group => group.adults)).toEqual([['p1'], ['p2'], ['p3']]);
    expect(family.people.filter(id => id === 'child')).toHaveLength(1);
  });
  it('handles a person without recorded family and rejects an invalid center', () => {
    expect(selectFamily(familyIndex(fixture()), 'isolated').people).toEqual(['isolated']);
    expect(() => selectFamily(familyIndex(fixture()), 'missing')).toThrow('Unknown');
  });
});
