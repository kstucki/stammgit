import { expect, it } from 'vitest';
import { relationshipEngine, relationshipStations } from './relationship-engine';
import type { Dataset } from './person';

it('prefers fewer reduced steps over fewer raw edges', () => {
  const d: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { parents: ['p'], partners: ['x'] }, p: { parents: ['q'] }, q: { parents: ['r'] }, r: { parents: ['b'] },
    x: { partners: ['y'] }, y: { partners: ['b'] }, b: {},
  } };
  const result = relationshipEngine(d).explain('a', 'b')!;
  expect(result.edgeCount).toBe(4); expect(result.segments).toHaveLength(1);
  expect(result.segments[0].direction).toBe('up');
});
it('breaks reduced-length ties by raw edge count, then stable IDs', () => {
  const d: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { parents: ['z', 'p', 'q'] }, b: { parents: ['r', 'z', 'p'] }, p: {}, q: { parents: ['r'] }, r: {}, z: {},
  } };
  const result = relationshipEngine(d).explain('a', 'b')!;
  expect(result.edgeCount).toBe(2); expect(result.segments[0].to).toBe('p');
  d.people = Object.fromEntries(Object.entries(d.people).reverse());
  for (const person of Object.values(d.people)) person.parents?.reverse();
  expect(relationshipEngine(d).explain('a', 'b')).toEqual(result);
});
it('handles missing, disconnected and identical people, and terminates on cycles', () => {
  const d: Dataset = { meta: { focusPersonId: 'a' }, people: { a: { parents: ['b'] }, b: { parents: ['a'] }, isolated: {} } };
  const engine = relationshipEngine(d);
  expect(engine.explain('a', 'missing')).toBeNull(); expect(engine.explain('a', 'isolated')).toBeNull();
  expect(engine.explain('a', 'a')).toEqual({ from: 'a', to: 'a', segments: [], edgeCount: 0 });
  expect(engine.explain('a', 'b')?.edgeCount).toBe(1);
});
it('matches exhaustive simple-path costs on small deterministic graphs', () => {
  let seed = 27;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  for (let example = 0; example < 200; example++) {
    const ids = Array.from({ length: 6 }, (_, i) => String(i));
    const people: Dataset['people'] = Object.fromEntries(ids.map(id => [id, {}]));
    const edges = new Map(ids.map(id => [id, [] as { to: string; direction: string }[]]));
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
      if (random() > .32) continue;
      if (random() < .4) {
        (people[ids[i]].partners ||= []).push(ids[j]);
        edges.get(ids[i])!.push({ to: ids[j], direction: 'partner' }); edges.get(ids[j])!.push({ to: ids[i], direction: 'partner' });
      } else {
        (people[ids[j]].parents ||= []).push(ids[i]);
        edges.get(ids[j])!.push({ to: ids[i], direction: 'up' }); edges.get(ids[i])!.push({ to: ids[j], direction: 'down' });
      }
    }
    let best = [Infinity, Infinity];
    function visit(id: string, seen: string[], last: string, segments: number, length: number) {
      if (id === '5') { if (segments < best[0] || segments === best[0] && length < best[1]) best = [segments, length]; return; }
      for (const e of edges.get(id)!) if (!seen.includes(e.to)) {
        const prev = seen.at(-2)!;
        const detour = last === 'upDown' && e.direction === 'up' && (people[prev]?.partners?.includes(e.to) || people[e.to]?.partners?.includes(prev));
        visit(e.to, [...seen, e.to], e.direction === 'down' && ['up', 'upDown'].includes(last) ? 'upDown' : e.direction,
          segments + (e.direction !== 'partner' && last !== 'partner' && last && !(['down', 'upDown'].includes(last) && e.direction === 'up') ? 0 : 1) + (detour ? 1 : 0), length + 1);
      }
    }
    visit('0', ['0'], '', 0, 0);
    const result = relationshipEngine({ meta: { focusPersonId: '0' }, people }).explain('0', '5');
    const steps = result?.segments.flatMap(s => s.steps) || [];
    let phase = '', detours = 0;
    steps.forEach((step, i) => {
      const prev = steps[i - 1];
      if (phase === 'upDown' && step.direction === 'up' && (people[prev.from].partners?.includes(step.to) || people[step.to].partners?.includes(prev.from))) detours++;
      phase = step.direction === 'down' && ['up', 'upDown'].includes(phase) ? 'upDown' : step.direction;
    });
    expect(result ? [relationshipStations(steps).length + detours, result.edgeCount] : [Infinity, Infinity]).toEqual(best);
    if (result) {
      const route = ['0', ...result.segments.flatMap(s => s.steps.map(e => e.to))];
      expect(new Set(route).size).toBe(route.length);
    }
  }
});
it('compresses a deep ancestry without a depth cutoff', () => {
  const people: Dataset['people'] = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [String(i), i ? { parents: [String(i - 1)] } : {}]));
  const result = relationshipEngine({ meta: { focusPersonId: '99' }, people }).explain('99', '0')!;
  expect(result.edgeCount).toBe(99); expect(result.segments).toHaveLength(1);
});
