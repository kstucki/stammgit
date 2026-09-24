import YAML from 'yaml';
import { pendingGetFile, pendingPutFile } from '../../public/assets/pending.js';
import { parseChapter, extractTokens, extractHeadings, containsRawHtml } from '../../public/assets/chronicle.js';
import type { Chapter, ChronicleIndex, Dataset } from '../domain/person';
export async function chapterText(tree: string, file: string, signal?: AbortSignal) {
  let local;
  try { local = await pendingGetFile(`chronicle/${tree}/${file}`, tree); }
  catch { /* Published chapters remain readable when IndexedDB is unavailable. */ }
  if (local) return new Blob([local.blob]).text();
  const response = await fetch(`/chronicle/${tree}/${file}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Chapter: ${response.status}`);
  return response.text();
}
export async function hydrateChronicle(tree: string, published: ChronicleIndex | null, files: string[]) {
  let index: ChronicleIndex = structuredClone(published) || { chapters: [] };
  for (const key of files) {
    if (key !== `chronicle/${tree}/index.yaml`) continue;
    const local = await pendingGetFile(key, tree); if (!local) continue;
    const config = YAML.parse(await new Blob([local.blob]).text());
    const chapters: Chapter[] = [];
    for (const file of config.chapters || []) {
      const text = await chapterText(tree, file), parsed = parseChapter(text);
      chapters.push({ file, title: parsed.frontmatter.title || file, date: parsed.frontmatter.date || undefined,
        ...extractTokens(text), sections: extractHeadings(text).map(h => ({ id: h.id, text: h.text })) });
    }
    index = { chapters };
  }
  return index.chapters.length ? index : published;
}
export function chapterCandidate(input: { file: string; title: string; date: string; body: string; unsourced: boolean }, data: Dataset, set: ChronicleIndex, t: { get(key: string, values?: Record<string, string | number>): string }) {
  if (!input.title.trim()) throw new Error(t.get('chapterNeedTitle'));
  const tokens = extractTokens(input.body), unknown = tokens.persons.filter(id => !data.people[id]);
  if (unknown.length) throw new Error(t.get('chapterBadPersons', { ids: unknown.join(', ') }));
  if (!tokens.sources.length && !input.unsourced) throw new Error(t.get('chapterNeedSource'));
  const html = containsRawHtml(input.body);
  if (html.length) throw new Error(t.get('chapterRawHtml', { lines: html.join(', ') }));
  const base = input.title.toLowerCase().replace(/[äöü]/g, c => ({ ä: 'ae', ö: 'oe', ü: 'ue' })[c]!).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kapitel';
  const file = input.file || `${base}.md`;
  if (!input.file && set.chapters.some(ch => ch.file === file)) throw new Error(t.get('chapterAlreadyExists'));
  const sections = extractHeadings(input.body).map(h => ({ id: h.id, text: h.text }));
  const bad = tokens.chapters.filter(ref => {
    const [target, section] = ref.split('#');
    const chapter = target === file ? { sections } : set.chapters.find(ch => ch.file === target);
    return !chapter || !!(section && !chapter.sections?.some(s => s.id === section));
  });
  if (bad.length) throw new Error(t.get('chapterBadRefs', { refs: bad.join(', ') }));
  // Keep the existing frontmatter format and normalize multiline titles.
  const text = `---\ntitle: ${input.title.trim().replace(/[\r\n]/g, ' ')}\n${input.date ? `date: ${input.date}\n` : ''}${input.unsourced ? 'unsourced: true\n' : ''}---\n\n${input.body.trim()}\n`;
  const entry: Chapter = { file, title: input.title.trim(), date: input.date || undefined, ...tokens, sections };
  const chapters = [...set.chapters.filter((ch, i, all) => all.findIndex(other => other.file === ch.file) === i)];
  const at = chapters.findIndex(ch => ch.file === file); if (at < 0) chapters.push(entry); else chapters[at] = entry;
  return { file, text, set: { ...set, chapters }, index: YAML.stringify({ chapters: chapters.map(ch => ch.file) }) };
}
export async function stageChapter(tree: string, candidate: ReturnType<typeof chapterCandidate>) {
  await pendingPutFile(`chronicle/${tree}/${candidate.file}`, new Blob([candidate.text], { type: 'text/markdown' }), tree);
  await pendingPutFile(`chronicle/${tree}/index.yaml`, new Blob([candidate.index], { type: 'text/yaml' }), tree);
}
