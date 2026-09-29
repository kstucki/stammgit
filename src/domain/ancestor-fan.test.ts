import { describe, expect, it } from 'vitest';
import { ancestorFan, fanDepth, fanGeometry } from './ancestor-fan';
import type { Dataset } from './person';
const data = (people: Dataset['people']): Dataset => ({ meta: { focusPersonId: 'child' }, people });
describe('ancestor positions', () => {
  it('keeps unknown places, reserves a recorded mother’s side and retains stable prefixes', () => {
    const d = data({ child: { parents: ['mother'] }, mother: { gender: 'f', parents: ['grand'] }, grand: {} });
    const slots = ancestorFan(d, 'child', 2);
    expect(slots.map(s => s.id)).toEqual(['child', undefined, 'mother', undefined, undefined, 'grand', undefined]);
    expect(slots[2].unknownType).toBe(true);
    expect(ancestorFan(d, 'child', 8).slice(0, slots.length)).toEqual(slots);
    expect(ancestorFan(d, 'child', 8)).toHaveLength(511);
    expect(ancestorFan(d, 'child', 10)).toHaveLength(2047);
    expect(ancestorFan(d, 'child', 10).slice(0, slots.length)).toEqual(slots);
  });
  it('follows biological or unspecified parents without mixing adoption into the lineage', () => {
    const d = data({ child: { parents: ['adoptive', 'mother', 'guardian', 'father'], parentDetails: {
      adoptive: { type: 'adoptive' }, guardian: { type: 'guardian' }, mother: { type: 'biological' }, father: { type: 'biological' },
    } }, adoptive: {}, guardian: {}, mother: { gender: 'f' }, father: { gender: 'm' } });
    expect(ancestorFan(d, 'child', 1).map(s => [s.id, s.unknownType])).toEqual([['child', false], ['father', false], ['mother', false]]);
  });
  it('reports ambiguous parents instead of silently discarding candidates', () => {
    const d = data({ child: { parents: ['a', 'b', 'c'] }, a: {}, b: {}, c: {} });
    const slots = ancestorFan(d, 'child', 2);
    expect(slots[0].issue).toBe('ambiguous');
    expect(slots.slice(1).every(s => s.id === undefined)).toBe(true);
  });
  it('repeats shared ancestors on separate paths but stops actual cycles', () => {
    const d = data({ child: { parents: ['a', 'b'] }, a: { parents: ['shared'] }, b: { parents: ['shared'] }, shared: { parents: ['child'] } });
    const slots = ancestorFan(d, 'child', 4);
    expect(slots.filter(s => s.id === 'shared')).toHaveLength(2);
    expect(slots.filter(s => s.issue === 'cycle')).toHaveLength(2);
    expect(slots.filter(s => s.generation === 4).every(s => !s.id)).toBe(true);
  });
  it('fills the upper semicircle with stable left and right branches and upright labels', () => {
    const left = fanGeometry(1, 0), right = fanGeometry(1, 1);
    expect(left.x).toBeLessThan(0); expect(right.x).toBeGreaterThan(0);
    expect(left.y).toBeLessThan(0); expect(right.y).toBeLessThan(0);
    for (let generation = 2; generation <= 10; generation++) {
      const sectors = Array.from({ length: 2 ** generation }, (_, i) => fanGeometry(generation, i));
      expect(sectors.some(s => s.y < 0)).toBe(true);
      expect(sectors.every(s => s.y < 0)).toBe(true);
      for (const s of sectors) { expect(s.rotation).toBeGreaterThanOrEqual(-90); expect(s.rotation).toBeLessThan(90); }
    }
  });
  it('bounds work and produces finite nondegenerate sectors at every depth', () => {
    expect([fanDepth(100), fanDepth(-1), fanDepth(NaN)]).toEqual([10, 1, 5]);
    for (let generation = 1; generation <= 10; generation++) for (let index = 0; index < 2 ** generation; index++) {
      const g = fanGeometry(generation, index);
      expect(g.path).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(g.rotation)).toBe(true);
    }
    expect(ancestorFan(data({ child: { parents: ['missing'] } }), 'child', 1)[1].id).toBeUndefined();
  });
});
