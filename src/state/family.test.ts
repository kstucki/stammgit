import { expect, it } from 'vitest';
import { readGraphState, rememberGraphState, readZoom, rememberZoom } from './family';
const data = { meta: { focusPersonId: 'a' }, people: { a: {}, b: {} } };
const memory = () => { const values = new Map<string, string>(); return { getItem: (key: string) => values.get(key) || null, setItem: (key: string, value: string) => { values.set(key, value); } }; };
it('keeps mode and roots per dataset but one persistent zoom for all datasets and modes', () => {
  const storage = memory();
  rememberGraphState('one', { mode: 'hourglass', roots: ['a', 'b'] }, storage);
  rememberZoom(.321, storage);
  expect(readGraphState(data, 'one', storage)).toEqual({ mode: 'hourglass', roots: ['a', 'b'] });
  expect(readGraphState(data, 'two', storage)).toEqual({ mode: 'family', roots: [] });
  expect(readZoom('one', storage)).toBe(.321); expect(readZoom('two', storage)).toBe(.321);
});
it('ignores missing identities and removed modes', () => {
  expect(readGraphState(data, 'one', { getItem: () => JSON.stringify({ mode: 'full', roots: ['a', 'missing', 'a'] }) })).toEqual({ mode: 'family', roots: ['a'] });
});
it('migrates the active legacy scale once, with global zoom taking precedence', () => {
  const legacy = { getItem: () => JSON.stringify({ mode: 'hourglass', scales: { family: .2, hourglass: .5 } }) };
  const storage = memory(); expect(readZoom('one', storage, legacy)).toBe(.5);
  rememberZoom(.7, storage); expect(readZoom('one', storage, legacy)).toBe(.7);
});
it('rejects invalid zoom without overwriting a valid global value', () => {
  const storage = memory(); rememberZoom(.5, storage);
  for (const invalid of [NaN, Infinity, -1, 0, 4, undefined]) rememberZoom(invalid, storage);
  expect(readZoom('one', storage)).toBe(.5);
  expect(readZoom('one', { getItem: () => '"1"' })).toBeUndefined();
  expect(readZoom('one', { getItem: () => { throw Error(); } })).toBeUndefined();
});
