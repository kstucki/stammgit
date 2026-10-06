import { describe, it, expect } from 'vitest';
import { availableSources, localizedSource, sourceBase, sourceVariant } from './source-language';
import { sourceDocuments, sourceCategory, setSourceCategory, groupByCategory, chronicleSourceUrls } from './sources';

const de = '/sources/book.pdf', pt = '/sources/book.pt.pdf';
it('recognises chronicle-only sources across languages and page anchors without assigning people', () => {
  const chapter = { file: 'story.md', title: 'Story', persons: [] };
  const used = chronicleSourceUrls({ chapters: [{ ...chapter, sources: [de + '#page=2'] }], variants: {
    pt: { chapters: [{ ...chapter, sources: [pt + '#page=4', '/sources/letter.pdf#page=1'] }] },
    en: { chapters: [chapter] },
  } });
  expect([...used]).toEqual([de, '/sources/letter.pdf']);
  expect(used.has('/sources/unused.pdf')).toBe(false);
  expect([...chronicleSourceUrls(null)]).toEqual([]);
  expect(sourceDocuments({}, used).every(doc => doc.persons.length === 0)).toBe(true);
});
describe('source language selection', () => {
  it('keeps one identity and retains page fragments and queries', () => {
    expect(sourceBase(pt)).toBe(de);
    expect(sourceVariant(de + '#page=8')).toBe(pt + '#page=8');
    expect(localizedSource(de + '?download=1#page=8', 'pt-BR', new Set([pt]))).toBe(pt + '?download=1#page=8');
  });
  it('selects Portuguese only when available, otherwise the original', () => {
    expect(localizedSource(de, 'pt', new Set([de, pt]))).toBe(pt);
    expect(localizedSource(de, 'pt', new Set([de]))).toBe(de);
    expect(localizedSource(pt, 'de', new Set([de, pt]))).toBe(de);
    expect(localizedSource(de, 'en', new Set([de, pt]))).toBe(de);
  });
  it('does not rewrite websites, other local files or unsafe URLs', () => {
    for (const url of ['https://example.org/book.pt.pdf', '/photos/test.pt.pdf', '/sources/test.png', 'javascript:alert(1)']) {
      expect(sourceVariant(url)).toBeUndefined();
      expect(localizedSource(url, 'pt', new Set([pt]))).toBe(url);
    }
  });
  it('sees pending uploads immediately and excludes pending deletion', () => {
    const assets = new Map([[pt, 'blob:pending']]);
    expect(localizedSource(de, 'pt', availableSources([de], assets, []))).toBe(pt);
    expect(localizedSource(de, 'pt', availableSources([de, pt], assets, ['book.pt.pdf']))).toBe(de);
    expect(localizedSource(de, 'pt', availableSources([de, pt], new Map(), []))).toBe(pt);
  });
  it('groups the variants and aggregates all person references once', () => {
    const docs = sourceDocuments({ a: { name: 'A', sources: [{ url: de, label: 'Book' }, { url: pt, label: 'Book' }] }, b: { name: 'B', sources: [{ url: pt, label: 'Book' }] } }, new Set([de, pt]));
    expect(docs).toEqual([{ url: de, label: 'Book', persons: ['a', 'b'] }]);
  });
  it('also lists uploaded documents without person references', () => {
    expect(sourceDocuments({}, new Set([de, pt, '/sources/thumbnails/book.jpg']))).toEqual([{ url: de, label: 'book.pdf', persons: [] }]);
  });
});
it('handles English independently, including canonical links, drafts and deletion', () => {
  const en='/sources/book.en.pdf';
  expect(sourceBase(en+'#page=3')).toBe(de+'#page=3');
  expect(sourceVariant(pt+'?download=1#page=3','en-US')).toBe(en+'?download=1#page=3');
  expect(localizedSource(en,'pt',new Set([de,pt,en]))).toBe(pt);
  expect(localizedSource(de,'en',new Set([de,pt]))).toBe(de);
  expect(localizedSource(de,'en-GB',availableSources([de,pt],new Map([[en,'blob:test']]),[]))).toBe(en);
  expect(localizedSource(de,'en',availableSources([de,pt,en],new Map(),['book.en.pdf']))).toBe(de);
  expect(sourceDocuments({a:{sources:[{url:en,label:'Book'},{url:pt,label:'Book'}]}},new Set([de,pt,en]))).toEqual([{url:de,label:'Book',persons:['a']}]);
  expect(sourceVariant('https://example.org/book.pdf','en')).toBeUndefined();
});
it.each([['W01', 'W02'], ['E1', 'S5']])('page anchors with evidence IDs %s/%s group under the collection title', (first, second) => {
  const bs = '/sources/quellendossier-x-2026.pdf';
  const docs = sourceDocuments({
    a: { name: 'A', sources: [{ url: bs + '#page=2', label: `HLS: A, abgerufen 04.10.2026 – Belegsammlung X, ${first}` }] },
    b: { name: 'B', sources: [{ url: bs + '#page=3', label: `Jahrbuch 1991, abgerufen 04.10.2026 – Belegsammlung X, ${second}` }] },
  }, new Set([bs]));
  expect(docs).toEqual([{ url: bs, label: 'Belegsammlung X', persons: ['a', 'b'] }]);
});
it('citations of one book that differ only by page share the book title', () => {
  const book = '/sources/festschrift.pdf';
  const docs = sourceDocuments({ a: { name: 'A', sources: [{ url: book, label: 'Festschrift (1956), S. 52' }] }, b: { name: 'B', sources: [{ url: book, label: 'Festschrift (1956), S. 33–36' }] } });
  expect(docs).toEqual([{ url: book, label: 'Festschrift (1956)', persons: ['a', 'b'] }]);
});
it('groups documents by category in display order and stores only deviations from the default', () => {
  const data = { meta: { focusPersonId: 'a' }, people: {} } as import('./person').Dataset;
  setSourceCategory(data, '/sources/memoir.pt.pdf#page=3', 'familie');
  setSourceCategory(data, '/sources/notice.pdf', 'todesanzeigen');
  expect(data.sourceCategories).toEqual({ '/sources/memoir.pdf': 'familie', '/sources/notice.pdf': 'todesanzeigen' });
  expect(sourceCategory(data.sourceCategories, '/sources/memoir.en.pdf')).toBe('familie');
  expect(sourceCategory(data.sourceCategories, 'https://example.org/x')).toBe('andere');
  const groups = groupByCategory([{ url: '/sources/notice.pdf' }, { url: '/sources/x.pdf' }, { url: '/sources/memoir.pdf' }], data.sourceCategories);
  expect(groups.map(g => [g.category, g.docs.map(d => d.url)])).toEqual([['familie', ['/sources/memoir.pdf']], ['todesanzeigen', ['/sources/notice.pdf']], ['andere', ['/sources/x.pdf']]]);
  setSourceCategory(data, '/sources/memoir.pdf', 'andere'); setSourceCategory(data, '/sources/notice.pdf', 'andere');
  expect(data.sourceCategories).toBeUndefined();
});
