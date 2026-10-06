import { expect, it } from 'vitest';
import type { Dataset } from './person';
import { sourceDocuments, sourcePage, readSourceFilter, matchesSource, removeSourceDetails } from './sources';
import { validateDataset } from '../../public/assets/dataset-validation.js';
import { exportGedcom, exportGedcom7 } from '../../public/assets/gedcom.js';

function catalogue(): Dataset {
  const sourceDetails: Dataset['sourceDetails'] = {}, sourceCategories: Dataset['sourceCategories'] = {};
  const sources = Array.from({ length: 31 }, (_, n) => {
    const id = `B${String(n + 1).padStart(6, '0')}`, url = `/sources/beleg-${id.toLowerCase()}.pdf`;
    sourceDetails[url] = { id, title: `Dokument ${String(n + 1).padStart(2, '0')}`, tags: n < 2 ? ['Müller', 'Meyer'] : ['Meyer'] };
    sourceCategories[url] = n < 30 ? 'belege' : 'register';
    return { url: url + '#page=2', label: 'Fundstelle' };
  });
  return { meta: { focusPersonId: 'a' }, people: { a: { name: 'Anna Test', sources } }, sourceDetails, sourceCategories };
}
it('paginates canonical documents, intersects family/category/search, and counts a shared source once', () => {
  const data = catalogue(), docs = sourceDocuments(data.people, new Set(), data.sourceDetails);
  expect(docs).toHaveLength(31);
  expect(docs[0].label).toBe('Dokument 01');
  const initial = readSourceFilter({ category: 'belege', page: 2 });
  const second = sourcePage(docs, data, '', initial);
  expect(second.docs).toHaveLength(5); expect(second.pages).toBe(2); expect(second.counts.register).toBe(1);
  const filtered = sourcePage(docs, data, 'anna muller', { ...initial, family: 'Meyer' });
  expect(filtered.total).toBe(2); expect(filtered.page).toBe(1); expect(filtered.families).toEqual(['Meyer', 'Müller']);
  expect(sourcePage(docs, data, '', { ...initial, family: 'Missing' }).docs).toEqual([]);
  expect(matchesSource(docs[0], 'b000001 anna', data)).toBe(true);
  expect(sourcePage(docs, data, 'absent', initial).page).toBe(1);
});
it('sanitises restored filters without carrying a family into another category', () => {
  expect(readSourceFilter(null)).toEqual({ category: 'all', family: '', page: 1, selected: '' });
  expect(readSourceFilter({ category: 'register', family: 'Meyer', page: -3 })).toMatchObject({ family: '', page: 1 });
  expect(readSourceFilter({ category: 'belege', family: 'Meyer', page: 3, selected: '/sources/test.pdf' })).toMatchObject({ family: 'Meyer', page: 3, selected: '/sources/test.pdf' });
});
it('validates unique evidence identifiers and family metadata at the shared boundary', () => {
  const data = catalogue(); expect(validateDataset(data)).toEqual([]);
  const detail = data.sourceDetails!['/sources/beleg-b000002.pdf'];
  detail.id = 'B000001'; expect(validateDataset(data).join()).toContain('.id');
  detail.id = 'B000002'; detail.tags = ['Meyer', 'Meyer']; expect(validateDataset(data).join()).toContain('.tags');
  detail.tags = ['Meyer']; detail.title = ''; expect(validateDataset(data).join()).toContain('.title');
});
it('preserves tags in full backups, excludes them from GEDCOM, and removes only deleted document metadata', () => {
  const data = catalogue(), before = JSON.parse(JSON.stringify(data));
  expect(before.sourceDetails).toEqual(data.sourceDetails);
  expect(exportGedcom(data)).not.toContain('Müller');
  data.people.a.sources!.push({ label: 'Testbuch', url: '/sources/book.en.pdf#page=12' });
  data.sourceDetails!['/sources/book.pdf'] = { id: 'B999999', title: 'Testbuch', tags: ['Katalogfamilie'] };
  const gedcom = exportGedcom7(data).text;
  expect(gedcom).toContain('1 REFN B999999');
  expect(gedcom).toContain('1 TITL Testbuch');
  expect(gedcom).toContain('2 PAGE PDF-Seite 12');
  expect(gedcom).not.toContain('Katalogfamilie');
  data.people.a.sources!.pop(); delete data.sourceDetails!['/sources/book.pdf'];
  removeSourceDetails(data, '/sources/beleg-b000001.en.pdf#page=2');
  expect(data.sourceDetails!['/sources/beleg-b000001.pdf']).toBeUndefined();
  expect(Object.keys(data.sourceDetails!)).toHaveLength(30);
  expect(data.people).toEqual(before.people);
});
