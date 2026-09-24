import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { validateDataset } from '../../netlify/shared/validate.mjs';
import { orderedPartners, parentGroups, partnerDetail, setParentDetail, setParentGroup, setPartnerDetail, linkRecordedRelation } from '../../public/assets/relationships.js';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { removePersonFromData, mergeImportedPeople, absorbPerson, countSourceLinks, removeSourceLinks } from '../../public/assets/model.js';
import { familyIndex, selectFamily, familyKey } from './family';
import { parentStyle, partnerStyle } from './relationship-view';
import { parentDescription, partnershipDescription, siblingDescription } from '../../public/assets/relationship-text.js';
import type { Dataset } from './person';

const annotated = (): Dataset => ({ meta: { focusPersonId: 'child' }, people: {
  child: { name: 'Child', parents: ['a', 'b', 'c', 'd'], parentGroups: [['a', 'b'], ['c'], ['d']], parentDetails: {
    a: { type: 'biological' }, b: { type: 'biological' },
    c: { type: 'adoptive', sources: [{ label: 'Adoption', url: '/sources/test.pdf' }] },
  } },
  a: { name: 'A', children: ['child'] }, b: { name: 'B', children: ['child'] },
  c: { name: 'C', children: ['child'], partners: ['d'], partnerDetails: { d: { kind: 'marriage', start: '1900' } } },
  d: { name: 'D', children: ['child'], partners: ['c'] },
} });
const strings = { get: (key: string) => key };

describe('optional relationship schema and individual parent edges', () => {
  it('accepts old data and grouped biological/adoptive/unspecified connections together', () => {
    expect(validateDataset(annotated())).toEqual([]);
    const data = annotated();
    delete data.people.child.parentDetails; delete data.people.child.parentGroups;
    expect(validateDataset(data)).toEqual([]);
    expect(parentGroups(data.people.child)).toEqual([['a'], ['b'], ['c'], ['d']]);
  });
  it('rejects dangling annotations, invalid types and incomplete or overlapping groups', () => {
    const invalid = [
      { parentDetails: { ghost: { type: 'adoptive' } } },
      { parentDetails: { a: { type: 'magic' } } },
      { parentDetails: { a: { type: 'other' } } },
      { parentDetails: { a: { type: 'biological', sources: [{ label: 'No URL' }] } } },
      { parentGroups: [['a', 'b'], ['b', 'c', 'd']] },
      { parentGroups: [['a', 'b']] }, { parentGroups: [[], ['a', 'b', 'c', 'd']] },
    ];
    for (const fields of invalid) {
      const data = annotated(); Object.assign(data.people.child, fields);
      expect(validateDataset(data).length, JSON.stringify(fields)).toBeGreaterThan(0);
    }
  });
  it('checks pair facts and dates while allowing owner-specific widowhood', () => {
    const data = annotated();
    data.people.d.partnerDetails = { c: { kind: 'partnership' } };
    expect(validateDataset(data).join()).toContain('conflicts');
    data.people.d.partnerDetails.c = { kind: 'marriage', status: 'verwitwet' };
    expect(validateDataset(data)).toEqual([]);
    data.people.d.partnerDetails.c.start = '1901';
    expect(validateDataset(data).join()).toContain('conflicts');
    delete data.people.d.partnerDetails.c.start;
    data.people.c.partnerDetails!.d.end = '1899';
    expect(validateDataset(data).join()).toContain('precedes');
    data.people.c.partnerDetails!.d.end = '1900-02-30';
    expect(validateDataset(data).join()).toContain('invalid date');
  });
  it('reports malformed arrays instead of throwing outside validation', () => {
    const data = annotated(); Object.assign(data.people.child, { parents: 1, parentDetails: null, partnerDetails: null });
    expect(validateDataset(data).length).toBeGreaterThan(0);
  });
  it('resolves shared facts on either side and checks dates across both entries', () => {
    const data = annotated();
    data.people.d.partnerDetails = { c: { kind: 'unknown', end: '1890' } };
    expect(partnerDetail(data.people, 'd', 'c').kind).toBe('marriage');
    expect(validateDataset(data).join()).toContain('precedes');
    data.people.d.partnerDetails.c.end = '1940';
    expect(validateDataset(data)).toEqual([]);
  });
  it('retains a single identity and never types the adopter’s partner by association', () => {
    const data = annotated(), family = selectFamily(familyIndex(data), 'child');
    expect(family.people.filter(id => id === 'child')).toHaveLength(1);
    expect(family.groups.find(group => group.id === familyKey(['c']))?.children).toEqual(['child']);
    expect(family.groups.find(group => group.id === familyKey(['c', 'd']))?.children).toEqual([]);
    expect(parentStyle(data, 'c', 'child')).toBe('adoptive');
    expect(parentStyle(data, 'd', 'child')).toBe('default');
    expect(parentStyle(data, 'a', 'child')).toBe('default');
    expect(parentDescription(data, 'd', 'child', strings)).toBe('');
    expect(partnershipDescription(data, 'a', 'b', strings)).toBe('');
    expect(partnerStyle(data, 'c', 'd')).toBe('default');
  });
  it('only identifies half-siblings when two biological parent pairs establish that fact', () => {
    const data = annotated();
    data.people.sibling = { parents: ['a', 'd'], parentDetails: { a: { type: 'biological' }, d: { type: 'biological' } } };
    expect(siblingDescription(data, 'child', 'sibling', ['a', 'd'], strings)).toBe('familyHalfSibling');
    delete data.people.sibling.parentDetails;
    expect(siblingDescription(data, 'child', 'sibling', ['a', 'd'], strings)).toBe('familySharedParents');
  });
  it('keeps marriage solid regardless of additional partners and distinguishes non-marital or ended partnerships', () => {
    const data = annotated();
    linkRecordedRelation(data, 'partners', 'c', 'a');
    expect(partnerStyle(data, 'c', 'd')).toBe('default');
    expect(partnerStyle(data, 'd', 'c')).toBe('default');
    expect(partnerStyle(data, 'c', 'a')).toBe('default'); // Missing type is not a non-marital assertion.
    setPartnerDetail(data, 'c', 'a', { kind: 'partnership' });
    expect(partnerStyle(data, 'c', 'a')).toBe('unmarried');
    expect(partnerStyle(data, 'a', 'c')).toBe('unmarried');
    setPartnerDetail(data, 'c', 'a', { status: 'verheiratet' });
    expect(partnerStyle(data, 'c', 'a')).toBe('default');
    expect(partnerStyle(data, 'a', 'c')).toBe('default');
    setPartnerDetail(data, 'd', 'c', { status: 'geschieden' });
    expect(partnerStyle(data, 'c', 'd')).toBe('ended');
    expect(partnerStyle(data, 'd', 'c')).toBe('ended');
  });
  it('recognizes existing partner statuses without requiring new kind annotations', () => {
    const data = annotated();
    delete data.people.c.partnerDetails;
    for (const [status, style] of [['verheiratet', 'default'], ['partner', 'unmarried'], ['geschieden', 'ended'], ['verwitwet', 'ended']]) {
      setPartnerDetail(data, 'd', 'c', { status });
      expect(partnerStyle(data, 'c', 'd')).toBe(style);
      expect(partnerStyle(data, 'd', 'c')).toBe(style);
    }
  });
});

describe('preserving metadata in existing operations', () => {
  it('changes a single parent annotation and keeps its sources', () => {
    const data = annotated();
    setParentDetail(data, 'child', 'c', { type: 'guardian' });
    expect(data.people.child.parentDetails!.c.sources).toHaveLength(1);
    expect(data.people.child.parentDetails!.a.type).toBe('biological');
    setParentGroup(data, 'child', 'd', 'c');
    expect(parentGroups(data.people.child)).toEqual([['a', 'b'], ['c', 'd']]);
    expect(validateDataset(data)).toEqual([]);
    data.people.e = {};
    linkRecordedRelation(data, 'parents', 'child', 'e');
    expect(data.people.child.parentGroups).toContainEqual(['e']);
    expect(validateDataset(data)).toEqual([]);
  });
  it('shares kind/dates but never mirrors personal widowhood', () => {
    const data = annotated();
    setPartnerDetail(data, 'c', 'd', { end: '1940', status: 'verwitwet' });
    expect(data.people.d.partnerDetails!.c.end).toBe('1940');
    expect(data.people.d.partnerDetails!.c.status).toBeUndefined();
  });
  it('remaps all imported references even with colliding input IDs', () => {
    const data = annotated(), incoming = annotated();
    incoming.people.a_import = { name: 'Existing input name' };
    const result = mergeImportedPeople(data, incoming.people);
    const child = data.people[result.idMap.get('child')!];
    expect(child.parentGroups).toContainEqual([result.idMap.get('a'), result.idMap.get('b')]);
    expect(child.parentDetails![result.idMap.get('c')!].type).toBe('adoptive');
    expect(new Set(result.idMap.values()).size).toBe(result.added);
    expect(validateDataset(data)).toEqual([]);
  });
  it('cleans deleted parent references, groups and relationship sources', () => {
    const data = annotated();
    expect(countSourceLinks(data.people, '/sources/test.pdf')).toBe(1);
    expect(removeSourceLinks(data.people, '/sources/test.pdf')).toBe(1);
    expect(data.people.child.parentDetails!.c.type).toBe('adoptive');
    expect(removePersonFromData(data, 'c').ok).toBe(true);
    expect(data.people.child.parentDetails!.c).toBeUndefined();
    expect(data.people.child.parentGroups).not.toContainEqual(['c']);
    expect(validateDataset(data)).toEqual([]);
  });
  it('rejects an unsafe annotated merge without partially changing the data', () => {
    const data = annotated(), before = structuredClone(data);
    expect(absorbPerson(data, 'a', 'c')).toMatchObject({ ok: false, reason: 'relationship_details' });
    expect(data).toEqual(before);
  });
  it('preserves the optional data through complete JSON and YAML serialization', () => {
    const data = annotated();
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
    expect(YAML.parse(YAML.stringify(data, { lineWidth: 0 }))).toEqual(data);
  });
  it('orders comparable partnership dates and keeps undated ties independent of array order', () => {
    const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
      a: { partners: ['z', 'b', 'c'], partnerDetails: { z: { start: '1800' }, b: { start: '1900' } } }, z: {}, b: {}, c: {},
    } };
    const order = orderedPartners(data.people, 'a');
    expect(order.indexOf('z')).toBeLessThan(order.indexOf('b'));
    data.people.a.partners!.reverse();
    expect(orderedPartners(data.people, 'a')).toEqual(order);
  });
});

describe('GEDCOM relationships against independently specified expectations', () => {
  it('preserves all four parent links and exact annotations on the application roundtrip', () => {
    const data = annotated(), returned = importGedcom(exportGedcom(data));
    for (const id of Object.keys(data.people)) {
      for (const field of ['parents', 'children', 'partners', 'parentDetails', 'parentGroups', 'partnerDetails'] as const)
        expect(returned.people[id][field], `${id}.${field}`).toEqual(data.people[id][field]);
    }
    expect(validateDataset(returned)).toEqual([]);
  });
  it('does not export MARR or import a partnership from shared parenthood', () => {
    const data = annotated(); delete data.people.c.partners; delete data.people.c.partnerDetails; delete data.people.d.partners;
    const text = exportGedcom(data);
    expect(text).not.toMatch(/^1 MARR/m);
    expect(importGedcom(text).people.c.partners).toBeUndefined();
  });
  it('imports standard birth and specifically HUSB-only adoption without typing the wife', () => {
    const text = `0 HEAD\n0 @I1@ INDI\n1 NAME Child\n1 FAMC @F1@\n2 PEDI birth\n1 FAMC @F2@\n1 ADOP\n2 FAMC @F2@\n3 ADOP HUSB\n0 @I2@ INDI\n1 NAME BiologicalA\n0 @I3@ INDI\n1 NAME BiologicalB\n0 @I4@ INDI\n1 NAME Adopter\n0 @I5@ INDI\n1 NAME Spouse\n0 @F1@ FAM\n1 HUSB @I2@\n1 WIFE @I3@\n1 CHIL @I1@\n0 @F2@ FAM\n1 HUSB @I4@\n1 WIFE @I5@\n1 MARR\n1 CHIL @I1@\n0 TRLR\n`;
    const result = importGedcom(text);
    expect(result.people.child.parents).toEqual(['biologicala', 'biologicalb', 'adopter', 'spouse']);
    expect(result.people.child.parentDetails).toEqual({ biologicala: { type: 'biological' }, biologicalb: { type: 'biological' }, adopter: { type: 'adoptive' } });
    expect(result.people.biologicala.partners).toBeUndefined();
    expect(result.people.adopter.partners).toEqual(['spouse']);
    expect(validateDataset(result)).toEqual([]);
    expect(() => importGedcom(text.replace('3 ADOP HUSB\n', ''))).toThrow('not specified');
  });
});
