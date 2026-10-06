import { expect, it, vi } from 'vitest';
import { chapterCandidate, chapterText } from './chronicle';
import { getT } from '../../public/assets/strings.js';
import { parseChapter } from '../../public/assets/chronicle.js';
const data = { meta: { focusPersonId: 'a' }, people: { a: { name: 'A' } } }, t = getT('de');
const set = { language: 'pt', chapters: [{ file: 'old.pt.md', title: 'Alt', persons: ['a'], sections: [{ id: 'teil', text: 'Teil' }] }] };
const input = { file: '', title: 'Neues Kapitel', date: '', body: '## Abschnitt\n[[p:a]] [[s:/sources/test.pdf]] [[c:neues-kapitel.pt.md#abschnitt]]', unsourced: false, language: 'pt' };
it('stages a new language chapter with a valid self-section and existing external reference', () => {
  const result = chapterCandidate({ ...input, body: input.body + ' [[c:old.pt.md#teil]]' }, data, set, t);
  expect(result.file).toBe('neues-kapitel.pt.md'); expect(result.set.language).toBe('pt');
  expect(result.set.chapters.map(ch => ch.file)).toEqual(['old.pt.md', 'neues-kapitel.pt.md']);
  expect(parseChapter(result.text).body.trim()).toBe(input.body + ' [[c:old.pt.md#teil]]');
});
it('rejects unknown people, missing sources, raw HTML and broken chapter/section references', () => {
  for (const body of ['[[p:missing]] [[s:/sources/test.pdf]]', 'No source', '<script>alert(1)</script> [[s:/sources/test.pdf]]', '[[c:old.pt.md#missing]] [[s:/sources/test.pdf]]', '[[c:no.md]] [[s:/sources/test.pdf]]']) {
    expect(() => chapterCandidate({ ...input, body }, data, set, t)).toThrow();
  }
});
it('does not overwrite an existing file when creating a same-named chapter', () => {
  expect(() => chapterCandidate({ ...input, title: 'Old', body: '[[s:/sources/test.pdf]]' }, data, set, t)).toThrow(t.get('chapterAlreadyExists'));
});
it('preserves unsourced status and replaces metadata of an edited file without moving it', () => {
  const result = chapterCandidate({ ...input, file: 'old.pt.md', unsourced: true, body: 'Vorhandene Erinnerung', date: '' }, data, set, t);
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

it('preserves subtitle, cover and book metadata when editing a chapter', () => {
  const frontmatter = { subtitle: 'Oberland · 1850 bis heute', cover: '/photos/example.jpg', author: 'Example Author', year: '2026' };
  const result = chapterCandidate({ ...input, frontmatter }, data, set, t);
  expect(parseChapter(result.text).frontmatter).toMatchObject(frontmatter);
  expect(result.set.chapters.at(-1)).toMatchObject(frontmatter);
});
