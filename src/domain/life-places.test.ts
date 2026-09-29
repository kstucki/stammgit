import { expect, it } from 'vitest';
import { formatLifeEvents } from './dates';
import { personLifeDetails } from './person-info';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { validateDataset } from '../../public/assets/dataset-validation.js';
it('keeps places literal and supports places without dates', () => {
  const person = { birth: '1970-04-12', birthPlace: 'Berlin', deathPlace: 'London' };
  expect(formatLifeEvents(person, 'en')).toEqual([
    { kind: 'birth', prefix: '*', date: '1970', place: 'Berlin' },
    { kind: 'death', prefix: '†', date: '', place: 'London' },
  ]);
  expect(personLifeDetails(person, 'en')).toEqual(['* 12 Apr 1970 in Berlin', '† in London']);
});
it('validates places and preserves multiline Unicode GEDCOM places, including undated events', () => {
  const person = { name: 'Test Person', birth: '1970', birthPlace: 'São Paulo, ' + 'Long place name '.repeat(20) + '\nSecond line', deathPlace: 'London' };
  const data = { meta: { focusPersonId: 'a' }, people: { a: person } };
  expect(validateDataset(data)).toEqual([]);
  expect(validateDataset({ ...data, people: { a: { birthPlace: 7 } } })).not.toEqual([]);
  const gedcom = exportGedcom(data);
  expect(gedcom).toContain('1 BIRT\n2 DATE 1970\n2 PLAC');
  expect(gedcom).toContain('1 DEAT\n2 PLAC London');
  expect(importGedcom(gedcom).people.a).toMatchObject(person);
});
