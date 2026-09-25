import { describe, expect, it } from 'vitest';
import { validateDataset } from '../../public/assets/dataset-validation.js';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { absorbPerson } from '../../public/assets/model.js';
import type { Dataset, Person } from './person';

const fixture = (): Dataset => ({ meta: { focusPersonId: 'a' }, people: { a: { name: 'A' }, b: { name: 'B' } } });

describe('recorded gender', () => {
  it('validates all choices and preserves them through GEDCOM, including unspecified', () => {
    for (const gender of ['m', 'f', 'd', undefined]) {
      const data = fixture();
      if (gender) data.people.a.gender = gender;
      expect(validateDataset(data)).toEqual([]);
      const imported = importGedcom(exportGedcom(data));
      expect((Object.values(imported.people) as Person[]).find(p => p.name === 'A')?.gender).toBe(gender);
    }
    const data = fixture(); data.people.a.gender = 'invalid';
    expect(validateDataset(data).some((error: string) => error.includes('gender'))).toBe(true);
  });

  it('retains a known value on merge and rejects conflicting values without changes', () => {
    const data = fixture(); data.people.b.gender = 'd';
    expect(absorbPerson(data, 'a', 'b').ok).toBe(true);
    expect(data.people.a.gender).toBe('d');
    const conflict = fixture(); conflict.people.a.gender = 'm'; conflict.people.b.gender = 'f';
    const before = structuredClone(conflict);
    expect(absorbPerson(conflict, 'a', 'b')).toEqual({ ok: false, reason: 'gender_conflict' });
    expect(conflict).toEqual(before);
  });
});
