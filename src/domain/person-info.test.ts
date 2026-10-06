import { expect, it } from 'vitest';
import { familyChips, lowEvidence, personInitials, personLifeDetails } from './person-info';
import { getT } from '../../public/assets/strings.js';
import type { Dataset } from './person';
const t = getT('de');
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
