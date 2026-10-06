import { expect, it } from 'vitest';
import { personContent } from '../../public/assets/person-language.js';
import { validateDataset } from '../../public/assets/dataset-validation.js';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { absorbPerson } from '../../public/assets/model.js';
const person = { name: 'Ana', occupation: 'Lehrerin', occupation_pt: 'Professora', notes: ['Deutsch eins', 'Deutsch zwei'], notes_pt: ['Português'] };
const dataset = () => ({meta:{focusPersonId:'a'},people:{a:structuredClone(person)}});
it('selects whole translated fields, with fallback for absent, empty and blank translations',()=>{
  expect(personContent(person,'pt-BR')).toEqual({occupation:'Professora',notes:['Português']});
  expect(personContent(person,'de')).toEqual({occupation:'Lehrerin',notes:['Deutsch eins','Deutsch zwei']});
  for(const blank of [{},{occupation_pt:'',notes_pt:[]},{occupation_pt:'  ',notes_pt:[' ']}]) {
    expect(personContent({occupation:person.occupation,notes:person.notes,...blank},'pt')).toEqual(personContent(person,'de'));
  }
});
it('validates translated fields without requiring a translation',()=>{
  expect(validateDataset(dataset())).toEqual([]);
  for(const fields of [{occupation_pt:42},{notes_pt:'text'},{notes_pt:[42]},{occupation_pt:null}]) {
    expect(validateDataset({meta:{focusPersonId:'a'},people:{a:{name:'A',...fields}}}).length).toBeGreaterThan(0);
  }
});
it('GEDCOM exports only the selected text, independently falls back and does not mutate bilingual data',()=>{
  const d=dataset(), before=JSON.stringify(d);
  for(const language of ['de','pt','pt-BR']) {
    const ged=exportGedcom(d,language), pt=language!=='de';
    expect(ged).toContain(`1 OCCU ${pt?'Professora':'Lehrerin'}`);
    expect(ged).toContain(`1 NOTE ${pt?'Português':'Deutsch eins'}`);
    expect(ged).not.toContain(pt?'Deutsch eins':'Português');
    expect(ged).not.toContain(pt?'Lehrerin':'Professora');
    expect(importGedcom(ged).people.a.occupation).toBe(pt?'Professora':'Lehrerin');
  }
  expect(JSON.stringify(d)).toBe(before);
  d.people.a.notes_pt=[];
  expect(exportGedcom(d,'pt')).toContain('1 NOTE Deutsch zwei');
  expect(exportGedcom(d,'pt')).toContain('1 OCCU Professora');
});
it('preserves translations when absorbing a blank duplicate, and rejects mismatched versions atomically',()=>{
  const d={meta:{focusPersonId:'a'},people:{a:{name:'A'},b:structuredClone(person)}};
  expect(absorbPerson(d,'a','b').ok).toBe(true);
  expect(d.people.a).toMatchObject({occupation_pt:'Professora',notes_pt:['Português']});
  const conflict={meta:{focusPersonId:'a'},people:{a:structuredClone(person),b:{name:'B',notes:['Additional untranslated note']}}};
  const before=JSON.stringify(conflict);
  expect(absorbPerson(conflict,'a','b')).toEqual({ok:false,reason:'translation_conflict'});
  expect(JSON.stringify(conflict)).toBe(before);
});
it('selects English, validates it, exports it and preserves it on merge', () => {
  const translated = { ...person, occupation_en: 'Teacher', notes_en: ['English note'] };
  expect(personContent(translated, 'en-US')).toEqual({ occupation: 'Teacher', notes: ['English note'] });
  for (const fields of [{}, { occupation_en: ' ', notes_en: [' '] }]) {
    expect(personContent({ ...person, ...fields }, 'en')).toEqual(personContent(person, 'de'));
  }
  for (const fields of [{occupation_en:42}, {notes_en:'text'}, {notes_en:[42]}, {notes_en:null}]) {
    expect(validateDataset({meta:{focusPersonId:'a'},people:{a:{name:'A',...fields}}}).length).toBeGreaterThan(0);
  }
  const d = {meta:{focusPersonId:'a'},people:{a:{name:'A'},b:translated}};
  expect(absorbPerson(d,'a','b').ok).toBe(true);
  expect(d.people.a).toMatchObject({occupation_en:'Teacher',notes_en:['English note']});
  const before = JSON.stringify(d), ged = exportGedcom(d, 'en-GB');
  expect(ged).toContain('1 OCCU Teacher'); expect(ged).toContain('1 NOTE English note');
  expect(ged).not.toContain('Deutsch eins'); expect(ged).not.toContain('Português');
  expect(importGedcom(ged).people.a.occupation).toBe('Teacher');
  expect(JSON.stringify(d)).toBe(before);
  const conflict = {meta:{focusPersonId:'a'},people:{a:translated,b:{...translated,notes_en:['Different']}}};
  const original = JSON.stringify(conflict);
  expect(absorbPerson(conflict,'a','b')).toEqual({ok:false,reason:'translation_conflict'});
  expect(JSON.stringify(conflict)).toBe(original);
});
