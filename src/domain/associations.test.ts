import { describe, expect, it } from 'vitest';
import { validateDataset } from '../../public/assets/dataset-validation.js';
import { associationsFor, associationDescription, setAssociation, removeAssociation } from '../../public/assets/associations.js';
import { removePersonFromData, mergeImportedPeople, absorbPerson, removeSourceLinks } from '../../public/assets/model.js';
import { exportGedcom, exportGedcom7, importGedcom } from '../../public/assets/gedcom.js';
import { personSources } from '../../public/assets/relationships.js';
import { getT } from '../../public/assets/strings.js';
import { familyIndex, selectFamily } from './family';
import { orderFamily, layoutFamily } from './family-layout';
import { selectGraph } from './tree-selection';
import { expandGraph } from './graph-expansion';
import { selectConnections } from './connections';
import { relationshipEngine } from './relationship-engine';
import { describeConnections } from './kinship';
import { personRelations } from './relationship-view';
import { sourceDocuments } from './sources';
import type { Dataset } from './person';

const fixture = (): Dataset => ({ meta: { focusPersonId: 'a' }, people: {
  a: { name: 'Person A', living: false, partners: ['b', 'c'], children: ['child'], associations: { h: {
    type: 'enslavement', documented: ['1841', '1846'], sources: [{ label: 'Register', url: '/sources/test.pdf#page=2' }],
  } } },
  b: { name: 'Person B', living: false, partners: ['a'], children: ['child'] },
  c: { name: 'Person C', living: false, partners: ['a'] },
  child: { name: 'Child', living: false, parents: ['a', 'b'] },
  h: { name: 'Person H', living: false },
  isolated: { name: 'Separate', living: false },
} });

describe('directed historical associations', () => {
  it('keeps both cited people in the catalogue when a relationship changes direction', () => {
    const data = fixture();
    const before = sourceDocuments(data.people);
    expect(before[0].persons).toEqual(['a', 'h']);
    const detail = structuredClone(data.people.a.associations!.h);
    removeAssociation(data, 'a', 'h'); setAssociation(data, 'h', 'a', detail);
    expect(sourceDocuments(data.people)).toEqual(before);
    expect(data.people.a.sources).toBeUndefined(); expect(data.people.h.sources).toBeUndefined();
  });
  it('stores one direction, reads both roles, validates targets and attestations', () => {
    const data = fixture();
    expect(validateDataset(data)).toEqual([]);
    expect(associationsFor(data.people, 'a')[0]).toMatchObject({ other: 'h', outgoing: true });
    expect(associationsFor(data.people, 'h')[0]).toMatchObject({ other: 'a', outgoing: false });
    for (const patch of [{ associations: null }, { associations: { ghost: { type: 'enslavement' } } },
      { associations: { a: { type: 'enslavement' } } }, { associations: { h: { type: 'marriage' } } },
      { associations: { h: { type: 'enslavement', documented: ['1841', '1841'] } } },
      { associations: { h: { type: 'enslavement', documented: ['invalid'] } } },
      { associations: { h: { type: 'enslavement', sources: [{}] } } }]) {
      const bad = fixture(); Object.assign(bad.people.a, patch); expect(validateDataset(bad).length).toBeGreaterThan(0);
    }
    data.people.h.associations = { a: { type: 'enslavement' } };
    expect(validateDataset(data).join()).toContain('one direction');
  });

  it('places associated people alongside adults while preserving all actual family groups', () => {
    const data = fixture(), family = selectFamily(familyIndex(data), 'a');
    const link = family.groups.find(group => group.association)!;
    expect(link).toMatchObject({ adults: ['a', 'h'], children: [], partnership: false });
    expect(family.partners).toEqual(['b', 'c']);
    expect(family.generationParents).not.toContainEqual({ parent: 'a', child: 'h' });
    for (const engine of ['typescript', 'legacy'] as const) {
      const order = orderFamily(family, undefined, engine), layout = layoutFamily(family, new Map(), order);
      expect(layout.people.get('h')!.y).toBe(layout.people.get('a')!.y);
      const row = order.nodes.filter(node => node.gen === order.nodes.find(node => node.id === 'a')!.gen).sort((a,b) => a.x-b.x).map(node=>node.id);
      expect(Math.abs(row.indexOf('a')-row.indexOf('h'))).toBeLessThanOrEqual(2);
      expect(layout.people.get('child')!.y).toBeGreaterThan(layout.people.get('h')!.y);
    }
    const without = fixture(); delete without.people.a.associations;
    expect(family.groups.filter(group => !group.association)).toEqual(selectFamily(familyIndex(without), 'a').groups);
  });

  it('shows historical context in card views in both directions without adding ancestors', () => {
    const data = fixture();
    for (const mode of ['family','hourglass','descendants'] as const) for (const center of ['a','h']) {
      const { family } = selectGraph(data, center, mode);
      expect(family.people).toContain('a'); expect(family.people).toContain('h');
      const layout = layoutFamily(family); expect(layout.people.get('a')!.y).toBe(layout.people.get('h')!.y);
    }
    expect(selectGraph(data, 'h', 'ancestors').family.people).toEqual(['h']);
    const base = selectFamily(familyIndex(data), 'h');
    expect(base.people).toEqual(['a','h']);
    const expanded = expandGraph(data, base, [{ id: 'a', direction: 'children' }]);
    expect(expanded.groups.find(group=>group.association)?.children).toEqual([]);
    expect(expanded.groups.some(group=>group.adults.includes('h') && group.children.length)).toBe(false);
  });

  it('keeps kinship computations separate, with historical connection paths and labels', () => {
    const data = fixture();
    expect(relationshipEngine(data).explain('a','h')).toBeNull();
    expect(relationshipEngine(data).explain('child','h')).toBeNull();
    const connected = selectConnections(data,['child','h']);
    expect(connected.components).toEqual([['child','h']]);
    expect(connected.edges.some(edge=>edge.kind==='association')).toBe(true);
    expect(connected.family!.groups.find(group=>group.association)?.partnership).toBe(false);
    expect(describeConnections(data,['a','h'],getT('de'))[0].message).toContain('Hielt in Sklaverei');
    expect(describeConnections(data,['h','a'],getT('en'))[0].message).toContain('Was enslaved by');
    expect(describeConnections(data,['child','h'],getT('pt'))[0].message).toContain('vínculos históricos');
    for (const code of ['de','en','pt']) {
      const description = associationDescription(associationsFor(data.people,'h')[0],'h',getT(code));
      expect(description).toContain('1841, 1846'); expect(description).not.toContain('association');
      expect(personRelations(data,'h',getT(code)).find(section=>section.key==='relAssociations')!.items[0].id).toBe('a');
      expect(personRelations(data,'h',getT(code)).find(section=>section.key==='relPartners')!.items).toEqual([]);
    }
  });

  it('preserves sources and remaps imports, protects merges and cleans deletions', () => {
    const data = fixture();
    expect(personSources(data.people.a)).toHaveLength(1);
    const imported = mergeImportedPeople(data, fixture().people);
    expect(data.people[imported.idMap.get('a')!].associations![imported.idMap.get('h')!].documented).toEqual(['1841','1846']);
    expect(validateDataset(data)).toEqual([]);
    const before=structuredClone(data); expect(absorbPerson(data,'h','isolated')).toMatchObject({ok:false, reason:'relationship_details'}); expect(data).toEqual(before);
    expect(removeSourceLinks(data.people,'/sources/test.pdf#page=2')).toBe(2);
    expect(removePersonFromData(data,'h').ok).toBe(true); expect(data.people.a.associations).toBeUndefined();
    expect(validateDataset(data)).toEqual([]);
    setAssociation(data,'a','isolated',{type:'enslavement'}); removeAssociation(data,'a','isolated');
    expect(data.people.a.associations).toBeUndefined();
    const reactive = new Proxy({ type: 'enslavement', documented: new Proxy(['1846'], {}) }, {});
    setAssociation(data,'a','isolated',reactive);
    reactive.documented.push('1847');
    expect(data.people.a.associations!.isolated.documented).toEqual(['1846']);
  });

  it('exports standard ASSO links and roundtrips exact metadata without false family records', () => {
    const data = fixture();
    for (const version of [5,7]) {
      const exported = version===7 ? exportGedcom7(data,{language:'en'}) : {text:exportGedcom(data,'en'), files:[]};
      const gedcom = exported.text;
      expect(gedcom).toContain('1 ASSO @I5@');
      expect(gedcom).toContain(version===7 ? '2 ROLE OTHER\n3 PHRASE Person enslaved by this individual' : '2 RELA Person enslaved by this individual');
      expect(gedcom).not.toMatch(/1 (HUSB|WIFE|CHIL) @I5@/);
      expect(gedcom).not.toContain('1 MARR');
      const parsed=importGedcom(gedcom), expected=structuredClone(data.people.a.associations!);
      if(version===5)delete expected.h.sources;
      expect(parsed.people.a.associations).toEqual(expected);
      expect(parsed.people.h.partners).toBeUndefined(); expect(parsed.people.h.parents).toBeUndefined();
      expect(validateDataset(parsed)).toEqual([]);
      if(version===7)expect(exported.files).toContainEqual(expect.objectContaining({path:'sources/test.pdf'}));
    }
  });

  it('omits historical details and association-only media when either party is hidden', () => {
    for (const hidden of ['a','h']) {
      const data=fixture();data.people[hidden].living=true;
      const result=exportGedcom7(data,{includeLiving:false});
      expect(result.text).not.toContain('1 ASSO'); expect(result.text).not.toContain('1841');
      expect(result.files).toEqual([]);
      const parsed=importGedcom(result.text);
      expect(Object.values(parsed.people).some((person:any)=>person.associations)).toBe(false);
      expect(exportGedcom(data,'de',{includeLiving:false})).not.toContain('1 ASSO');
    }
  });
});
