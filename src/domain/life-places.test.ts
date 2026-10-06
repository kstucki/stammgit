import { expect, it } from 'vitest';
import { formatLifeEvents } from './dates';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { validateDataset } from '../../public/assets/dataset-validation.js';
it('keeps places literal, preserves years and supports places without dates', () => {
  expect(formatLifeEvents({ birth: '1987-07-15', birthPlace: 'Belp' }, 'pt')).toEqual([{ kind: 'birth', prefix: '*', date: '1987', place: 'Belp' }]);
  expect(formatLifeEvents({ birth: 'um 1850', birthPlace: 'Basel', deathPlace: 'Ittigen' }, 'de')).toEqual([
    { kind: 'birth', prefix: '*', date: 'um 1850', place: 'Basel' }, { kind: 'death', prefix: '†', date: '', place: 'Ittigen' },
  ]);
});
it('validates place fields and preserves them in standard GEDCOM events, also without dates', () => {
  const person = { name: 'Test Person', birth: '1960', birthPlace: 'São Paulo, ' + 'Langer Ortsname '.repeat(20), deathPlace: 'Ittigen' };
  const data = { meta: { focusPersonId: 'a' }, people: { a: person } };
  expect(validateDataset(data)).toEqual([]);
  expect(validateDataset({ ...data, people: { a: { birthPlace: 7 } } })).not.toEqual([]);
  const gedcom = exportGedcom(data);
  expect(gedcom).toContain('1 BIRT\n2 DATE 1960\n2 PLAC');
  expect(gedcom).toContain('1 DEAT\n2 PLAC Ittigen');
  expect(importGedcom(gedcom).people.a).toMatchObject(person);
});
