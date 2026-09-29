import { expect, it } from 'vitest';
import { displayPersonName, findPeople } from './person';
import { validateDataset } from '../../public/assets/dataset-validation.js';
import { absorbPerson } from '../../public/assets/model.js';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { renderChapter } from '../../public/assets/chronicle.js';
const person = { name: 'Anna Maria Beispiel', displayName: 'Anni Beispiel' };
it('uses an explicit display name, with full-name and ID fallback', () => {
  expect(displayPersonName(person)).toBe('Anni Beispiel');
  expect(displayPersonName({ ...person, displayName: ' ' })).toBe(person.name);
  expect(displayPersonName({}, 'a')).toBe('a');
  expect(findPeople({ a: person }, 'Maria')).toEqual(['a']);
  expect(findPeople({ a: person }, 'Anni')).toEqual(['a']);
  expect(person.name).toBe('Anna Maria Beispiel');
});
it('validates display names and preserves them through GEDCOM without changing NAME', () => {
  const data = { meta: { focusPersonId: 'a' }, people: { a: person } };
  expect(validateDataset(data)).toEqual([]);
  expect(validateDataset({ ...data, people: { a: { ...person, displayName: 7 } } })).not.toEqual([]);
  const ged = exportGedcom(data);
  expect(ged).toContain('1 NAME Anna Maria /Beispiel/');
  expect(importGedcom(ged).people.a).toMatchObject(person);
});
it('preserves one display name and rejects conflicting names atomically', () => {
  const data = { meta: { focusPersonId: 'a' }, people: { a: { name: 'Anna' }, b: { ...person } } };
  expect(absorbPerson(data, 'a', 'b').ok).toBe(true);
  expect(data.people.a).toMatchObject({ displayName: person.displayName });
  const conflict = { meta: { focusPersonId: 'b' }, people: { a: person, b: { ...person, displayName: 'Maria Beispiel' } } };
  const before = structuredClone(conflict);
  expect(absorbPerson(conflict, 'a', 'b')).toEqual({ ok: false, reason: 'display_name_conflict' });
  expect(conflict).toEqual(before);
});
it('keeps explicit chronicle wording and safely escapes display names', () => {
  const html = renderChapter('[[p:a]] / [[p:a|meine Mutter]]', { personLabel: () => displayPersonName(person) });
  expect(html).toContain('>Anni Beispiel</a>');
  expect(html).toContain('>meine Mutter</a>');
  expect(renderChapter('[[p:a]]', { personLabel: () => '<script>x</script>' })).not.toContain('<script>');
});
