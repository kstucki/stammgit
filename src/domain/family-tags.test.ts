import { expect, it } from 'vitest';
import { canonicalFamilyTag, cleanFamilyTag, familyTags, similarFamilyTags } from './family-tags';
it('uses existing spellings despite whitespace, case and Unicode differences', () => {
  expect(cleanFamilyTag('  van   Berg ')).toBe('van Berg');
  expect(canonicalFamilyTag('  VAN berg ', ['van Berg'])).toBe('van Berg');
  expect(canonicalFamilyTag('Mu\u0308ller', ['Müller'])).toBe('Müller');
  expect(canonicalFamilyTag('Sommer (Nord)', ['Sommer'])).toBe('Sommer (Nord)');
});
it('suggests similar names without merging distinct families', () => {
  expect(similarFamilyTags('Winterbac', ['Winterbach', 'Huber'])).toEqual(['Winterbach']);
  expect(familyTags({ meta: { focusPersonId: 'a' }, people: { a: {} }, sourceDetails: {
    '/a.pdf': { title: 'A', tags: ['Sommer', 'Sommer (Nord)'] },
    '/b.pdf': { title: 'B', tags: ['Sommer', 'Huber'] },
  } })).toEqual(['Huber', 'Sommer', 'Sommer (Nord)']);
});
