import { expect, it } from 'vitest';
import { formatDate, formatLifespan } from './dates';
it.each([
  ['1970', '1970', '1970'],
  ['1970-04-12', '12.4.1970', '12 Apr 1970'],
  ['12.04.1970', '12.4.1970', '12 Apr 1970'],
  ['1970-04', 'Apr. 1970', 'Apr 1970'],
  ['1850 od. 1851', '1850 od. 1851', '1850 or 1851'],
  ['1850 ?', '1850?', '1850?'],
  ['um 1850', 'um 1850', 'c. 1850'],
  ['vor 1700', 'vor 1700', 'before 1700'],
  ['nach 1700', 'nach 1700', 'after 1700'],
])('localizes date-only value %s without losing precision or uncertainty', (raw, de, en) => {
  expect(formatDate(raw, 'de')).toBe(de);
  expect(formatDate(raw, 'en')).toBe(en);
});
it.each(['1900-02-29', '31.04.1970', '1970-13', '1970-04-00', 'unknown summer'])('preserves invalid or free text %s', raw => {
  expect(formatDate(raw, 'en')).toBe(raw);
});
it('handles leap days, early years and missing values without time zones', () => {
  expect(formatDate('2000-02-29', 'de')).toBe('29.2.2000');
  expect(formatDate('0099-01-02', 'en')).toBe('2 Jan 0099');
  expect(formatDate(undefined)).toBe('');
  expect(formatDate(null)).toBe('');
});
it('shows years on cards and full dates in information', () => {
  expect(formatLifespan({ birth: '1970-04-12' }, 'en')).toBe('* 1970');
  expect(formatLifespan({ death: '1970-04-12' }, 'de')).toBe('† 1970');
  expect(formatLifespan({ birth: 'um 1850' }, 'en')).toBe('* c. 1850');
  expect(formatLifespan({ birth: '1970-04-12' }, 'en', 'info')).toBe('* 12 Apr 1970');
  expect(formatLifespan({ birth: '1900', death: '1970' })).toBe('1900–1970');
});
