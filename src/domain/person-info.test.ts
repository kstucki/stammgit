import { expect, it } from 'vitest';
import { familyChips, lowEvidence, personInitials, personSubtitle } from './person-info';
import { getT } from '../../public/assets/strings.js';
import type { Dataset } from './person';
const t = getT('de');
it('keeps complete recorded dates and does not invent evidence ratings', () => {
  expect(personSubtitle({ birth: '22.10.1960', occupation: 'Lehrerin' })).toBe('22.10.1960 – · Lehrerin');
  expect(personSubtitle({ death: '2000' })).toBe('† 2000');
  expect(personInitials('Alex Sample-Smith')).toBe('AS');
  expect(lowEvidence({})).toBe(false);
  expect(lowEvidence({ notes: ['Belegstufe 1.'] })).toBe(false);
  expect(lowEvidence({ notes: ['Belegstufe 2: Originale ungeprüft.'] })).toBe(true);
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
