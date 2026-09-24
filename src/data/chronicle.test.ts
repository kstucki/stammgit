import { expect, it, vi } from 'vitest';
import { chapterCandidate, chapterText } from './chronicle';
import { getT } from '../../public/assets/strings.js';
import { parseChapter } from '../../public/assets/chronicle.js';
const data = { meta: { focusPersonId: 'a' }, people: { a: { name: 'A' } } }, t = getT('de');
const set = { chapters: [{ file: 'old.md', title: 'Alt', persons: ['a'], sections: [{ id: 'teil', text: 'Teil' }] }] };
const input = { file: '', title: 'Neues Kapitel', date: '', body: '## Abschnitt\n[[p:a]] [[s:/sources/test.pdf]] [[c:neues-kapitel.md#abschnitt]]', unsourced: false };
it('stages a new chapter with a valid self-section and existing external reference', () => {
  const result = chapterCandidate({ ...input, body: input.body + ' [[c:old.md#teil]]' }, data, set, t);
  expect(result.file).toBe('neues-kapitel.md');
  expect(result.set.chapters.map(ch => ch.file)).toEqual(['old.md', 'neues-kapitel.md']);
  expect(parseChapter(result.text).body.trim()).toBe(input.body + ' [[c:old.md#teil]]');
});
it('rejects unknown people, missing sources, raw HTML and broken chapter/section references', () => {
  for (const body of ['[[p:missing]] [[s:/sources/test.pdf]]', 'No source', '<script>alert(1)</script> [[s:/sources/test.pdf]]', '[[c:old.md#missing]] [[s:/sources/test.pdf]]', '[[c:no.md]] [[s:/sources/test.pdf]]']) {
    expect(() => chapterCandidate({ ...input, body }, data, set, t)).toThrow();
  }
});
it('does not overwrite an existing file when creating a same-named chapter', () => {
  expect(() => chapterCandidate({ ...input, title: 'Old', body: '[[s:/sources/test.pdf]]' }, data, set, t)).toThrow(t.get('chapterAlreadyExists'));
});
it('preserves unsourced status and replaces metadata of an edited file without moving it', () => {
  const result = chapterCandidate({ ...input, file: 'old.md', unsourced: true, body: 'Vorhandene Erinnerung', date: '' }, data, set, t);
  expect(result.set.chapters).toHaveLength(1); expect(parseChapter(result.text).frontmatter).toEqual({ title: 'Neues Kapitel', unsourced: 'true' });
});

it('reads the published chapter when local file storage fails', async () => {
  const fetcher = vi.fn(async () => new Response('Published text'));
  vi.stubGlobal('indexedDB', { open() { throw new Error('Storage blocked'); } });
  vi.stubGlobal('fetch', fetcher);
  try {
    expect(await chapterText('demo', 'intro.md')).toBe('Published text');
    expect(fetcher).toHaveBeenCalledWith('/chronicle/demo/intro.md', expect.objectContaining({ cache: 'no-store' }));
  } finally { vi.unstubAllGlobals(); }
});
