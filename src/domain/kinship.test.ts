import { expect, it } from 'vitest';

import { describeConnections } from './kinship';
import { relationshipEngine, relationshipStations } from './relationship-engine';
import { getT } from '../../public/assets/strings.js';
import type { Dataset } from './person';
const de = getT('de');
// Isolated browser fixtures intentionally contain no private family dataset.
function family(a: number, b: number, gender?: string): Dataset {
  const people: Dataset['people'] = { a: { name: 'A' } }; let previous = 'a';
  for (let i = 1; i <= a + b; i++) {
    const id = i === a + b ? 'b' : `p${i}`;
    people[id] = { name: id === 'b' ? 'B' : id, gender };
    if (i <= a) people[previous].parents = [id]; else people[id].parents = [previous];
    previous = id;
  }
  return { meta: { focusPersonId: 'a' }, people };
}
const describe = (d: Dataset, ids = ['a', 'b'], t = de) => describeConnections(d, ids, t)[0];
const output = (d: Dataset, ids = ['a', 'b'], t = de) => { const p = describe(d, ids, t); return p.sentence || p.chain.join(' → '); };
it.each([
  [1, 0, 'Vater', 'Mutter', 'Elternteil'], [0, 1, 'Sohn', 'Tochter', 'Kind'],
  [2, 0, 'Grossvater', 'Grossmutter', 'Grosselternteil'], [0, 2, 'Enkel', 'Enkelin', 'Enkelkind'],
  [3, 0, 'Urgrossvater', 'Urgrossmutter', 'Urgrosselternteil'], [0, 3, 'Urenkel', 'Urenkelin', 'Urenkelkind'],
  [4, 0, 'Ururgrossvater', 'Ururgrossmutter', 'Ururgrosselternteil'], [0, 4, 'Ururenkel', 'Ururenkelin', 'Ururenkelkind'],
  [5, 0, '3-facher Urgrossvater', '3-fache Urgrossmutter', '3-faches Urgrosselternteil'],
  [0, 5, '3-facher Urenkel', '3-fache Urenkelin', '3-faches Urenkelkind'],
  [1, 1, 'Bruder', 'Schwester', 'Geschwister'], [2, 1, 'Onkel', 'Tante', 'Onkel/Tante'],
  [1, 2, 'Neffe', 'Nichte', 'Neffe/Nichte'], [2, 2, 'Cousin', 'Cousine', 'Cousin/Cousine'],
  [3, 3, 'Cousin 2. Grades', 'Cousine 2. Grades', 'Cousin/Cousine 2. Grades'],
  [4, 4, 'Cousin 3. Grades', 'Cousine 3. Grades', 'Cousin/Cousine 3. Grades'],
])('formats blood section (%i,%i) for all genders', (a, b, m, f, u) => {
  for (const [sex, label] of [['m', m], ['f', f], [undefined, u], ['d', u]]) {
    expect(output(family(Number(a), Number(b), sex as string | undefined))).toBe(`B ist ${label} von A.`);
  }
});
it.each([
  [4, 3, 'B ist Cousin 2. Grades von p1, dem Vater von A.'],
  [3, 4, 'B ist Sohn von p6, dem Cousin 2. Grades von A.'],
  [3, 1, 'B ist Bruder von p2, dem Grossvater von A.'],
  [1, 3, 'B ist Enkel von p2, dem Bruder von A.'],
  [5, 2, 'B ist Cousin von p3, dem Urgrossvater von A.'],
  [2, 5, 'B ist Urenkel von p4, dem Cousin von A.'],
  [7, 2, 'B ist Cousin von p5, dem 3-fachen Urgrossvater von A.'],
])('names actual path anchors for offset (%i,%i)', (a, b, expected) => {
  expect(output(family(a, b, 'm'))).toBe(expected);
});
it('uses Halb only with two recorded parents on both sides and one shared', () => {
  const d = family(1, 1, 'f'); d.people.x = {}; d.people.y = {};
  expect(output(d)).toBe('B ist Schwester von A.');
  d.people.a.parents!.push('x'); expect(output(d)).toBe('B ist Schwester von A.');
  d.people.b.parents!.push('y'); expect(output(d)).toBe('B ist Halbschwester von A.');
  d.people.b.gender = 'm'; expect(output(d)).toBe('B ist Halbbruder von A.');
  delete d.people.b.gender; expect(output(d)).toBe('B ist Halbgeschwister von A.');
  d.people.b.parents = ['p1', 'x']; expect(output(d)).toBe('B ist Geschwister von A.');
});
it('preserves first-selection perspective and produces n−1 descriptions', () => {
  const d = family(2, 1, 'm'); d.people.a.gender = 'f'; d.people.isolated = {};
  expect(output(d)).toBe('B ist Onkel von A.');
  expect(output(d, ['b', 'a'])).toBe('A ist Nichte von B.');
  expect(describeConnections(d, ['b', 'a', 'isolated', 'b', 'missing'], de).map(p => [p.a, p.b])).toEqual([['b', 'a'], ['b', 'isolated']]);
  expect(describe(d, ['b', 'isolated']).message).toContain('keine Verbindung');
  expect(describeConnections(d, [], de)).toEqual([]);
  expect(describeConnections(d, ['a', 'a'], de)).toEqual([]);
});
it('uses a sentence for two stations, chain for three, and respects partnership history', () => {
  const d = family(1, 1, 'f'); d.people.b.partners = ['c']; d.people.b.partnerDetails = { c: { status: 'verheiratet' } };
  d.people.c = { name: 'C', gender: 'm' };
  expect(output(d, ['a', 'c'])).toBe('C ist Ehemann von B, der Schwester von A.');
  d.people.b.partnerDetails.c.end = '2001'; expect(output(d, ['a', 'c'])).toContain('früherer Ehemann');
  delete d.people.b.partnerDetails; expect(output(d, ['a', 'c'])).toContain('Partner von B');
  d.people.c.partners = ['z']; d.people.z = { name: 'Z' };
  expect(describe(d, ['a', 'z']).chain).toEqual(['A', 'B (Schwester)', 'C (Partner)', 'Z (Partner/Partnerin)']);
});
it('retains adoption evidence and keeps social steps separate', () => {
  const d = family(3, 0, 'm'); d.people.p1.parentDetails = { p2: { type: 'adoptive' } };
  expect(output(d)).toContain('Urgrossvater'); expect(output(d)).toContain('Adoption von p1 durch p2');
  d.people.p1.parentDetails.p2.type = 'guardian';
  expect(describe(d).chain).toHaveLength(4); expect(output(d)).toContain('Sorgebeziehung'); expect(output(d)).not.toContain('Urgrossvater');
});
it('localises English and does not mutate the dataset', () => {
  const d = family(4, 3, 'f'), before = JSON.stringify(d);
  expect(output(d, ['a', 'b'], getT('en'))).toBe('B is cousin (degree 2) of p1, the mother of A.');
  expect(JSON.stringify(d)).toBe(before);
});
it('prefers a recorded partnership over a shared child in both directions', () => {
  const d: Dataset = { meta: { focusPersonId: 'a' }, people: { a: { partners: ['b'] }, b: {}, child: { parents: ['a', 'b'] } } };
  for (const [a,b] of [['a','b'], ['b','a']]) {
    const exp = relationshipEngine(d).explain(a,b)!;
    expect(exp.edgeCount).toBe(1); expect(exp.segments[0].direction).toBe('partner');
  }
  delete d.people.a.partners;
  const exp = relationshipEngine(d).explain('a','b')!;
  expect(relationshipStations(exp.segments.flatMap(s => s.steps))).toHaveLength(2);
});
