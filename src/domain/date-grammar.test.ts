import { describe, expect, it } from 'vitest';
import { parseDate, isValidDate, normalizeDate, defaultLiving } from '../../public/assets/date-grammar.js';
import { gedcomDate, internalDate, exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { validateDataset } from '../../public/assets/dataset-validation.js';

describe('date grammar', () => {
  it('accepts exactly the documented notations', () => {
    for (const v of ['1921', '1921-04', '1921-04-15', 'um 1659', 'vor 1659', 'nach 1703', '1995 od. 1996', '1898 ?']) expect(isValidDate(v)).toBe(true);
    for (const v of ['09.06.2023', '1921-02-30', 'ca. 1659', '1996 od. 1995', 'Frühling 1900', '']) expect(isValidDate(v)).toBe(false);
    expect(parseDate('1995 od. 1996')).toEqual({ type: 'either', year: 1995, year2: 1996 });
  });
  it('normalizes lenient input from the editor in all three languages', () => {
    expect(normalizeDate('9.6.2023')).toBe('2023-06-09');
    expect(normalizeDate('ca. 1659')).toBe('um 1659');
    expect(normalizeDate('before 1659')).toBe('vor 1659');
    expect(normalizeDate('depois de 1703')).toBe('nach 1703');
    expect(normalizeDate('1995 ou 1996')).toBe('1995 od. 1996');
    expect(normalizeDate('1898?')).toBe('1898 ?');
    expect(normalizeDate('Frühling 1900')).toBe('Frühling 1900');
  });
  it('treats a death date or a birth before 1920 as deceased', () => {
    expect(defaultLiving({ birth: '1919-12-31' })).toBe(false);
    expect(defaultLiving({ birth: '1920' })).toBe(true);
    expect(defaultLiving({ birth: '1990', death: '2020' })).toBe(false);
    expect(defaultLiving({})).toBe(true);
  });
});

describe('GEDCOM dates and new person fields', () => {
  it('maps every notation to GEDCOM and back', () => {
    const pairs: [string, string][] = [['1987-07-15', '15 JUL 1987'], ['1899-04', 'APR 1899'], ['1921', '1921'], ['um 1659', 'ABT 1659'], ['vor 1659', 'BEF 1659'], ['nach 1703', 'AFT 1703'], ['1995 od. 1996', 'BET 1995 AND 1996'], ['1898 ?', 'EST 1898']];
    for (const [internal, ged] of pairs) { expect(gedcomDate(internal)).toBe(ged); expect(internalDate(ged)).toBe(internal); }
    expect(internalDate('CAL 1700')).toBe('um 1700');
    expect(internalDate('FROM 1700 TO 1710')).toBeNull();
  });
  it('keeps birth surname, living flag and dates through a roundtrip and validates them', () => {
    const data = { meta: { focusPersonId: 'a' }, people: { a: { name: 'Anna Sample-Smith', birthSurname: 'Smith', living: false, birth: 'um 1790', death: '1855-03-02' } } };
    expect(validateDataset(data)).toEqual([]);
    expect(importGedcom(exportGedcom(data)).people.a).toMatchObject(data.people.a);
    // A death date takes precedence; the repository build check reports the inconsistency.
    expect(validateDataset({ ...data, people: { a: { name: 'A', living: true, death: '2000' } } })).toEqual([]);
    expect(validateDataset({ ...data, people: { a: { name: 'A', living: 'ja' } } })).not.toEqual([]);
    expect(validateDataset({ ...data, people: { a: { name: 'A', birth: '09.06.2023' } } })).not.toEqual([]);
    expect(validateDataset({ ...data, people: { a: { name: 'A', birthSurname: ' ' } } })).not.toEqual([]);
  });
  it('turns unknown GEDCOM dates into a note and infers the living flag on import', () => {
    const ged = '0 HEAD\n1 GEDC\n2 VERS 5.5.1\n0 @I1@ INDI\n1 NAME Test /Person/\n1 BIRT\n2 DATE FROM 1700 TO 1710\n0 TRLR\n';
    const p = importGedcom(ged).people.test_person;
    expect(p.birth).toBeUndefined();
    expect(p.notes).toEqual(['GEDCOM BIRT DATE: FROM 1700 TO 1710']);
    expect(p.living).toBe(true);
  });
});
