import { describe, expect, it } from 'vitest';
import { validateDataset } from '../../public/assets/dataset-validation.js';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { absorbPerson } from '../../public/assets/model.js';
import type { Dataset, EvidenceStatus } from './person';
const fixture = (): Dataset => ({ meta: { focusPersonId: 'a' }, people: { a: { name: 'A' }, b: { name: 'B' } } });

describe('explicit combined evidence status', () => {
  it('accepts only the three literals or an omitted field and preserves GEDCOM roundtrips', () => {
    for (const value of [undefined, 'unsicher', 'gut', 'gesichert'] as const) {
      const data = fixture();
      if (value) data.people.a.evidenceStatus = value;
      expect(validateDataset(data)).toEqual([]);
      expect(importGedcom(exportGedcom(data)).people.a.evidenceStatus).toBe(value);
    }
    for (const invalid of ['', 'unknown', 'Unsicher', null, 0, false, {}, []]) {
      const data = fixture();
      data.people.a.evidenceStatus = invalid as EvidenceStatus;
      expect(validateDataset(data).some((message: string) => message.includes('evidenceStatus'))).toBe(true);
    }
    expect(() => importGedcom('0 @I1@ INDI\n1 NAME A\n1 _STAMMBAUM_EVIDENCE "wrong"')).toThrow('Invalid _STAMMBAUM_EVIDENCE');
  });
  it('retains a status on merge and rejects conflicts without mutation', () => {
    for (const side of ['a', 'b']) {
      const data = fixture(); data.people[side].evidenceStatus = 'unsicher';
      expect(absorbPerson(data, 'a', 'b').ok).toBe(true);
      expect(data.people.a.evidenceStatus).toBe('unsicher');
    }
    const data = fixture(); data.people.a.evidenceStatus = 'gut'; data.people.b.evidenceStatus = 'gesichert';
    const before = structuredClone(data);
    expect(absorbPerson(data, 'a', 'b')).toEqual({ ok: false, reason: 'evidence_conflict' });
    expect(data).toEqual(before);
  });
});
