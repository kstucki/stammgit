import { expect, it } from 'vitest';
import { isWebUrl } from '../../public/assets/web-links.js';
import { validateDataset } from '../../public/assets/dataset-validation.js';
import { absorbPerson, removeSourceLinks } from '../../public/assets/model.js';
import { exportGedcom, importGedcom } from '../../public/assets/gedcom.js';
import { sourceDocuments } from './sources';
import type { Dataset } from './person';

const links = [{ label: 'Website', url: 'https://example.org/profile?lang=de#about' }];
it('validates personal links at the dataset boundary and rejects executable, relative and malformed URLs', () => {
  for (const url of ['https://example.org', 'http://example.org/a', 'https://example.org/?a=1&b=2']) expect(isWebUrl(url)).toBe(true);
  for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.org', '/profile', 'https://', 'https://example.org/ a', 'mailto:x@example.org']) {
    expect(validateDataset({ meta: { focusPersonId: 'a' }, people: { a: { links: [{ url }] } } }).join()).toContain('.links');
  }
  for (const invalid of ['https://example.org', [null], [{ url: 'https://example.org', label: 3 }]])
    expect(validateDataset({ meta: { focusPersonId: 'a' }, people: { a: { links: invalid } } }).join()).toContain('.links');
  expect(validateDataset({ meta: { focusPersonId: 'a' }, people: { a: { links } } })).toEqual([]);
});
it('keeps websites outside the evidence collection, even when the same URL is also cited', () => {
  const people = { a: { links, sources: [{ label: 'Evidence', url: links[0].url }] } };
  expect(sourceDocuments({ a: { links } })).toEqual([]);
  expect(sourceDocuments(people)).toHaveLength(1);
  removeSourceLinks(people, links[0].url);
  expect(people.a.links).toEqual(links);
});
it('preserves personal links when merging people and during GEDCOM round trips', () => {
  const data: Dataset = { meta: { focusPersonId: 'a' }, people: {
    a: { name: 'Anna Test', living: true, links },
    b: { name: 'Anna Test', living: true, links: [...links, { url: 'https://example.net' }] },
  } };
  expect(absorbPerson(data, 'a', 'b').ok).toBe(true);
  expect(data.people.a.links).toHaveLength(2);
  const ged = exportGedcom(data);
  expect(ged).not.toContain('1 NOTE Quelle:');
  expect(importGedcom(ged).people.a.links).toEqual(data.people.a.links);
});
