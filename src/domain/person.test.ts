import { describe, expect, it } from 'vitest';
import { findPeople, years, personHref, chapterHref } from './person';
import { initialCenter, rememberCenter } from '../state/family';

describe('person presentation and selection', () => {
  it('preserves uncertain date text in the model and extracts only existing years for cards', () => {
    const person = { birth: 'um 1820', death: 'nach 1890' };
    expect(years(person, 'geb.')).toBe('1820–1890');
    expect(person.birth).toBe('um 1820');
    expect(years({ birth: 'unbekannt' }, 'geb.')).toBe('');
    expect(years({ death: '1890' }, 'geb.')).toBe('† 1890');
  });
  it('finds accents and duplicates without selecting an arbitrary identity', () => {
    const people = { b: { name: 'José Test' }, a: { name: 'José Test' }, c: { name: 'Anna' } };
    expect(findPeople(people, 'jose')).toEqual(['a', 'b']);
    expect(findPeople(people, ' ')).toEqual([]);
    expect(findPeople(people, 'missing')).toEqual([]);
  });
  it('uses dataset configuration as the initial center and isolates saved centers by dataset', () => {
    const dataset = { meta: { focusPersonId: 'a' }, people: { a: {}, b: {} } };
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(initialCenter(dataset, 'one', storage)).toBe('a');
    rememberCenter('one', 'b', storage);
    expect(initialCenter(dataset, 'one', storage)).toBe('b');
    expect(initialCenter(dataset, 'two', storage)).toBe('a');
    rememberCenter('one', 'removed', storage);
    expect(initialCenter(dataset, 'one', storage)).toBe('a');
  });
  it('encodes identities and chapter paths in document transitions', () => {
    expect(new URL(personHref('a&action=edit', 'tree'), 'https://test').searchParams.get('person')).toBe('a&action=edit');
    const chapter = new URL(chapterHref('intro.md'), 'https://test');
    expect(chapter.searchParams.get('chapter')).toBe('intro.md');
  });
});
