import { expect, it } from 'vitest';
import { familyChips, lowEvidence, personInitials, personLifeDetails, personSourceSections } from './person-info';
import { getT } from '../../public/assets/strings.js';
import type { Dataset } from './person';
const t = getT('de');
it('shows only enslavement evidence in both directions and all languages', () => {
  const own = { label: 'Eigene Biografie', url: '/sources/own.pdf#page=1' };
  const shared = { label: 'Register', url: '/sources/shared.pdf#page=2' };
  const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { name: 'Person A', sources: [own, shared], associations: { b: { type: 'enslavement', sources: [shared] } } },
    b: { name: 'Person B', sources: [shared] },
    c: { name: 'Person C', parents: ['b'], parentDetails: { b: { type: 'adoptive', sources: [shared] } } },
  } };
  const before = structuredClone(data);
  for (const code of ['de','en','pt']) {
    const a = personSourceSections(data, 'a', getT(code)), b = personSourceSections(data, 'b', getT(code));
    expect(a.own).toEqual([own, shared]); expect(b.own).toEqual([shared]);
    expect(a.relationships[0].sources).toEqual([shared]);
    expect(b.relationships).toHaveLength(1);
    expect(b.relationships.every(group => group.sources[0].label === 'Register')).toBe(true);
    expect(personSourceSections(data, 'c', getT(code))).toEqual({ own: [], relationships: [] });
  }
  expect(data).toEqual(before);
  delete data.people.b.sources;
  expect(personSourceSections(data, 'b', t).own).toEqual([]);
  expect(personSourceSections(data, 'b', t).relationships).toHaveLength(1);
  expect(data.people.a.sources).toEqual([own, shared]);
});
it('keeps initials and does not invent evidence ratings', () => {
  expect(personInitials('Alex Sample-Smith')).toBe('AS');
  expect(lowEvidence({})).toBe(false);
  expect(lowEvidence({ notes: ['Belegstufe 1.'] })).toBe(false);
  expect(lowEvidence({ notes: ['Belegstufe 2: Originale ungeprüft.'] })).toBe(false);
  expect(lowEvidence({ evidenceStatus: 'unsicher' })).toBe(true);
  expect(lowEvidence({ evidenceStatus: 'gut' })).toBe(false);
  expect(lowEvidence({ evidenceStatus: 'gesichert' })).toBe(false);
});
it('separates former marriage, marks adoption and keeps complete names', () => {
  const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { parents: ['p1', 'p2'], partners: ['b', 'c'], parentDetails: { p1: { type: 'adoptive' } }, partnerDetails: { b: { status: 'geschieden' }, c: { status: 'verheiratet' } } },
    p1: { name: 'Alex Eins', birth: '1950' }, p2: { name: 'Alex Zwei', birth: '1952' },
    b: { name: 'Bea Eins', partners: ['a'] }, c: { name: 'Clara Zwei', partners: ['a'] },
  } };
  const groups = familyChips(data, 'a', t);
  expect(groups[0].items.map(item => item.name)).toEqual(['Alex Eins', 'Alex Zwei']);
  expect(groups[0].items[0].annotation).toBe('Adoption');
  expect(groups.map(group => group.label)).toContain('frühere Ehe');
  expect(groups.map(group => group.label)).toContain('Ehe');
});


it('formats independent life events with full dates, local places and invariant symbols', () => {
  const person = { birth: '1926-05-02', birthPlace: 'Basel', death: '2025-09-05', deathPlace: 'Ittigen' };
  expect(personLifeDetails(person)).toEqual(['* 2.5.1926 in Basel', '† 5.9.2025 in Ittigen']);
  expect(personLifeDetails(person, 'pt-BR')).toEqual(['* 2 de maio de 1926 em Basel', '† 5 de setembro de 2025 em Ittigen']);
  expect(personLifeDetails(person, 'en')).toEqual(['* 2 May 1926 in Basel', '† 5 Sep 2025 in Ittigen']);
  expect(personLifeDetails({ birth: '1960' })).toEqual(['* 1960']);
  expect(personLifeDetails({ death: 'um 1900' })).toEqual(['† um 1900']);
  expect(personLifeDetails({ birthPlace: 'Basel', deathPlace: 'Ittigen' })).toEqual(['* in Basel', '† in Ittigen']);
  expect(personLifeDetails({ occupation: 'Lehrerin' })).toEqual([]);
});


it('has no relationship section for an undocumented association or personal sources alone', () => {
  const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { sources: [{ url: '/sources/register.pdf' }], associations: { b: { type: 'enslavement' } } },
    b: {},
  } };
  for (const code of ['de', 'en', 'pt']) {
    expect(personSourceSections(data, 'a', getT(code)).relationships).toEqual([]);
    expect(personSourceSections(data, 'b', getT(code)).relationships).toEqual([]);
    data.people.a.associations!.b.sources = [];
    expect(personSourceSections(data, 'a', getT(code)).relationships).toEqual([]);
  }
});
