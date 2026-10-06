import { expect, it } from 'vitest';
import { formatDate, formatLifespan } from './dates';
const examples = [
 ['1859', '1859', '1859', '1859'],
 ['1859-09-05', '5.9.1859', '5/9/1859', '5 Sep 1859'],
 ['05.09.1859', '5.9.1859', '5/9/1859', '5 Sep 1859'],
 ['1859-09', 'Sept. 1859', 'set. de 1859', 'Sep 1859'],
 ['1850 od. 1851', '1850 od. 1851', '1850 ou 1851', '1850 or 1851'],
 ['1850 ?', '1850?', '1850?', '1850?'],
 ['um 1850', 'um 1850', 'c. 1850', 'c. 1850'],
 ['vor 1700', 'vor 1700', 'antes de 1700', 'before 1700'],
 ['nach 1700', 'nach 1700', 'depois de 1700', 'after 1700'],
 ['unbekannt', 'unbekannt', 'unbekannt', 'unbekannt'],
];
for (const [i, lang] of ['de', 'pt', 'en'].entries()) {
  it.each(examples)(`${lang}: %s`, (raw, ...expected) => expect(formatDate(raw, lang)).toBe(expected[i]));
  it.each(['1859-13', '1859-02-29', '31.04.1859', '1859-09-00', 'ungefähr Sommer 1800'])(`${lang}: keeps invalid/free text %s`, raw => expect(formatDate(raw, lang)).toBe(raw));
  it(`${lang}: cards show years and info retains full dates`, () => {
    expect(formatLifespan({ birth: '1859-09-05', death: '1945' }, lang)).toBe('1859–1945');
    expect(formatLifespan({ death: '1945' }, lang, 'info')).toBe('† 1945');
    expect(formatLifespan({}, lang)).toBe('');
    expect(formatLifespan({ death: '1945-09-05' }, lang)).toBe('† 1945');
    expect(formatLifespan({ birth: '1987-07' }, lang)).toBe(['* 1987', '* 1987', '* 1987'][i]);
    expect(formatLifespan({ birth: '15.07.1987' }, lang)).toBe(['* 1987', '* 1987', '* 1987'][i]);
    expect(formatLifespan({ birth: 'um 1850' }, lang)).toBe(['* um 1850', '* c. 1850', '* c. 1850'][i]);
    expect(formatLifespan({ birth: '1987-07-15' }, lang, 'info')).toBe(['* 15.7.1987', '* 15 de julho de 1987', '* 15 Jul 1987'][i]);
    expect(formatLifespan({ death: '1945-09-05' }, lang, 'info')).toBe(['† 5.9.1945', '† 5 de setembro de 1945', '† 5 Sep 1945'][i]);
    expect(formatLifespan({ birth: '1987-07-15' }, lang)).toBe(['* 1987', '* 1987', '* 1987'][i]);
    expect(formatLifespan({ birth: '1859-09-05', death: '1945' }, lang, 'info')).toBe(['5.9.1859 – 1945', '5 de setembro de 1859 – 1945', '5 Sep 1859 – 1945'][i]);
  });
}
it('long Portuguese form, leap days, early years and absent values', () => {
  expect(formatDate('1859-09-05', 'pt-BR', 'long')).toBe('5 de setembro de 1859');
  expect(formatDate('2000-02-29', 'pt')).toBe('29/2/2000');
  expect(formatDate('0099-01-02', 'de')).toBe('2.1.0099');
  expect(formatDate(undefined)).toBe(''); expect(formatDate(null)).toBe('');
});

it('rejects legacy German dates in stored data; the editor normalizes them before saving', async () => {
  const { dateWarnings, validateDataset } = await import('../../public/assets/dataset-validation.js');
  const { normalizeDate } = await import('../../public/assets/date-grammar.js');
  const data = { meta: { focusPersonId: 'a' }, people: { a: { birth: '05.09.1859', death: '1945' } } };
  expect(dateWarnings(data)).toHaveLength(1);
  expect(validateDataset(data).join()).toContain('unknown date');
  expect(validateDataset({ ...data, people: { a: { birth: normalizeDate('05.09.1859'), death: '1945' } } })).toEqual([]);
});
