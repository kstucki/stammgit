import { expect, it } from 'vitest';
import type { Dataset } from './person';
import { relationshipEngine } from './relationship-engine';
import { relationshipChain } from './relationship-chain';
import { formatRelationship } from './kinship';
import { getT } from '../../public/assets/strings.js';

const fixture = (): Dataset => ({ meta: { focusPersonId: 'a' }, people: {
  a: { name: 'Anna', parents: ['c', 'd'] }, b: { name: 'Bert', parents: ['c', 'd'] },
  c: { name: 'Clara', partners: ['d'] }, d: { name: 'Daniel', partners: ['c'] },
} });
const chain = (data: Dataset) => relationshipChain(data, relationshipEngine(data).explain('a', 'b')!);

it('groups documented common parents and preserves input and explanation', () => {
  const data = fixture(), explanation = relationshipEngine(data).explain('a', 'b')!;
  const before = JSON.stringify({ data, explanation });
  expect(relationshipChain(data, explanation).map(s => s.people)).toEqual([['a'], ['c', 'd'], ['b']]);
  expect(formatRelationship(data, explanation, getT('de'))).toEqual(['Anna', 'Clara und Daniel (Eltern)', 'Bert (Kind)']);
  expect(JSON.stringify({ data, explanation })).toBe(before);
});
it('does not equate co-parenthood with a recorded partnership', () => {
  const data = fixture(); delete data.people.c.partners; delete data.people.d.partners;
  expect(chain(data)[1].people).toEqual(['c']);
});
it('excludes later partners and partners connected to only one neighbour', () => {
  const data = fixture(); data.people.b.parents = ['c'];
  expect(chain(data)[1].people).toEqual(['c']);
  data.people.a.parents = ['c'];
  expect(chain(data)[1].people).toEqual(['c']);
});
it('requires the same generation depth on both sides', () => {
  const data = fixture(); data.people.a.parents = ['c', 'extra']; data.people.extra = { parents: ['d'] };
  expect(chain(data)[1].people).toEqual(['c']);
});
it('keeps chosen endpoints individual', () => {
  const data = fixture();
  expect(relationshipChain(data, relationshipEngine(data).explain('a', 'c')!).map(s => s.people)).toEqual([['a'], ['c']]);
});
it('does not attribute adoption to the other partner', () => {
  const data = fixture(); data.people.a.parentDetails = { d: { type: 'adoptive' } };
  expect(chain(data)[1].people).toEqual(['c']);
});
it('retains adoption evidence for both paired parents', () => {
  const data = fixture(); data.people.a.parentDetails = { c: { type: 'adoptive' }, d: { type: 'adoptive' } };
  const result = formatRelationship(data, relationshipEngine(data).explain('a', 'b')!, getT('de'));
  expect(result[1]).toBe('Clara und Daniel (Eltern; Adoption von Anna durch Clara; Adoption von Anna durch Daniel)');
});
it('selects one compatible documented partner deterministically', () => {
  const data = fixture(); data.people.c.partners = ['z', 'd']; data.people.z = { partners: ['c'] };
  data.people.a.parents!.push('z'); data.people.b.parents!.push('z');
  expect(chain(data)[1].people).toEqual(['c', 'd']);
  data.people.c.partners.reverse();
  expect(chain(data)[1].people).toEqual(['c', 'd']);
});
