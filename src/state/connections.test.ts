import { expect, it } from 'vitest';
import { readConnections } from './connections';
const data = { meta: { focusPersonId: 'a' }, people: { a: {}, b: {}, c: {} } };
it('resets to an explicit pair instead of appending to the old selection', () => {
  expect(readConnections(data, 'one', ['b', 'c'], { getItem: () => '["a"]' })).toEqual(['b', 'c']);
});
it('retains an empty selection and filters duplicate, stale and invalid identities', () => {
  expect(readConnections(data, 'one', [], { getItem: () => '[]' })).toEqual([]);
  expect(readConnections(data, 'one', [], { getItem: () => '["a","missing","a",7]' })).toEqual(['a']);
});
it('starts at the remembered family center and tolerates unavailable storage', () => {
  expect(readConnections(data, 'one', [], { getItem: key => key === 'familyCenter:one' ? 'b' : null })).toEqual(['b']);
  expect(readConnections(data, 'one', [], { getItem: () => { throw Error(); } })).toEqual(['a']);
});
