import { expect, it } from 'vitest';
import { readState, stateUrl } from './navigation';
it('roundtrips center, language, panel, roots and connection targets', () => {
  const state = readState(new URL('https://example.org/?view=family&person=a&action=connections&connect=a&connect=b&info=c&language=pt&root=a'));
  expect(readState(stateUrl(state, new URL('https://example.org/')))).toEqual(state);
});
it('reads legacy person links as info and explicit family links as center', () => {
  expect(readState(new URL('https://example.org/?person=a&action=person'))).toMatchObject({ info: 'a', person: '' });
  expect(readState(new URL('https://example.org/?view=family&person=a'))).toMatchObject({ info: '', person: 'a' });
});
