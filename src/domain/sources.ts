import { sourceBase } from './source-language';
import { personSources } from '../../public/assets/relationships.js';
import type { ChronicleIndex, Dataset, SourceCategory } from './person';
import { SOURCE_CATEGORIES, DEFAULT_SOURCE_CATEGORY } from '../../public/assets/source-categories.js';
// A page anchor (`#page=n`) points to one item inside a document; the document is the file.
export const documentUrl = (url: string) => sourceBase(url).replace(/[?#].*$/, '');
export function chronicleSourceUrls(index: ChronicleIndex | null): ReadonlySet<string> {
  return new Set([index, ...Object.values(index?.variants || {})]
    .flatMap(set => set?.chapters.flatMap(chapter => chapter.sources || []) || [])
    .map(documentUrl));
}
// Item labels in an evidence collection end with "– <collection>, <number>", e.g. "… – Belegsammlung Beispiel, B01".
const collectionName = (label: string) => label.match(/\s–\s([^–]+?),\s*[A-Z]{1,3}\d+$/)?.[1].trim() || null;
// Citations of one document that differ only by a trailing page reference ("…, S. 52") share the document title.
const withoutPages = (label: string) => label.replace(/,\s*(?:S\.|p\.|Kap\.)\s*[\d–\-, ]+$/, '').trim();
function documentLabel(labels: Map<string, number>) {
  const keys = [...labels.keys()];
  for (const name of [collectionName, withoutPages]) {
    const names = keys.map(name);
    if (keys.length > 1 && names[0] && names.every(value => value === names[0])) return names[0];
  }
  return [...labels].sort((a, b) => b[1] - a[1])[0][0];
}
export function sourceDocuments(people: Dataset['people'], files: ReadonlySet<string> = new Set(), details: Dataset['sourceDetails'] = {}) {
  const docs = new Map<string, { labels: Map<string, number>; persons: string[] }>();
  for (const [id, person] of Object.entries(people)) for (const source of personSources(person)) {
    const url = documentUrl(source.url);
    const entry = docs.get(url) || { labels: new Map<string, number>(), persons: [] };
    entry.labels.set(source.label || source.url, (entry.labels.get(source.label || source.url) || 0) + 1);
    if (!entry.persons.includes(id)) entry.persons.push(id);
    docs.set(url, entry);
  }
  for (const file of files) {
    if (!/^\/sources\/[^/]+\.(pdf|png|jpe?g)$/i.test(file)) continue;
    const base = sourceBase(file);
    const url = files.has(base) ? base : file;
    if (!docs.has(url)) docs.set(url, { labels: new Map([[url.split('/').pop()!, 1]]), persons: [] });
  }
  return [...docs].map(([url, entry]) => ({ url, label: details[url]?.title || documentLabel(entry.labels),
    persons: entry.persons.sort((a, b) => (people[a].name || a).localeCompare(people[b].name || b, 'de')),
  })).sort((a, b) => a.label.localeCompare(b.label, 'de'));
}
export type SourceDocument = ReturnType<typeof sourceDocuments>[number];
export const SOURCE_PAGE_SIZE = 25;
export type SourceFilter = { category: SourceCategory | 'all'; family: string; page: number; selected: string };
export function readSourceFilter(value: unknown): SourceFilter {
  const v = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const category = sourceCategories.includes(v.category as SourceCategory) ? v.category as SourceCategory : 'all';
  return { category, family: category === 'belege' && typeof v.family === 'string' ? v.family : '', page: Number.isSafeInteger(v.page) && Number(v.page) > 0 ? Number(v.page) : 1, selected: typeof v.selected === 'string' ? v.selected : '' };
}
export function matchesSource(doc: SourceDocument, query: string, data: Dataset) {
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const detail = data.sourceDetails?.[doc.url];
  const text = normalize([doc.label, doc.url, detail?.id, detail?.citation, ...(detail?.tags || []), ...doc.persons.map(id => data.people[id].name || id)].filter(Boolean).join(' '));
  return normalize(query.trim()).split(/\s+/).every(word => text.includes(word));
}
export function sourcePage(entries: SourceDocument[], data: Dataset, query: string, filter: SourceFilter) {
  const matches = entries.filter(doc => matchesSource(doc, query, data));
  const counts = Object.fromEntries(sourceCategories.map(category => [category, matches.filter(doc => sourceCategory(data.sourceCategories, doc.url) === category).length]));
  const families = [...new Set(entries.filter(doc => sourceCategory(data.sourceCategories, doc.url) === 'belege').flatMap(doc => data.sourceDetails?.[doc.url]?.tags || []))].sort((a, b) => a.localeCompare(b, 'de'));
  const filtered = matches.filter(doc => (filter.category === 'all' || sourceCategory(data.sourceCategories, doc.url) === filter.category)
    && (filter.category !== 'belege' || !filter.family || data.sourceDetails?.[doc.url]?.tags?.includes(filter.family)));
  const pages = Math.max(1, Math.ceil(filtered.length / SOURCE_PAGE_SIZE));
  const page = Math.min(filter.page, pages);
  return { docs: filtered.slice((page - 1) * SOURCE_PAGE_SIZE, page * SOURCE_PAGE_SIZE), total: filtered.length, matched: matches.length, counts, families, pages, page };
}
export function removeSourceDetails(data: Dataset, url: string) {
  if (!data.sourceDetails) return;
  delete data.sourceDetails[documentUrl(url)];
  if (!Object.keys(data.sourceDetails).length) delete data.sourceDetails;
}
export const sourceCategories = SOURCE_CATEGORIES as SourceCategory[];
export function sourceCategory(categories: Dataset['sourceCategories'], url: string): SourceCategory {
  const category = categories?.[documentUrl(url)];
  return category && sourceCategories.includes(category) ? category : DEFAULT_SOURCE_CATEGORY as SourceCategory;
}
// Only deviations from the default are stored, so the map stays small and new documents need no entry.
export function setSourceCategory(data: Dataset, url: string, category: SourceCategory) {
  const map = { ...(data.sourceCategories || {}) }, key = documentUrl(url);
  if (category === DEFAULT_SOURCE_CATEGORY) delete map[key]; else map[key] = category;
  if (Object.keys(map).length) data.sourceCategories = map; else delete data.sourceCategories;
}
export function groupByCategory<T extends { url: string }>(docs: T[], categories: Dataset['sourceCategories']) {
  return sourceCategories.map(category => ({ category, docs: docs.filter(doc => sourceCategory(categories, doc.url) === category) }))
    .filter(group => group.docs.length);
}
export const personId = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'person';
export function createPerson(data: Dataset, name: string) {
  const base = personId(name); let id = base, n = 2;
  while (Object.hasOwn(data.people, id)) id = `${base}_${n++}`;
  // New persons count as living until a death date or the flag says otherwise (privacy-safe default).
  data.people[id] = { name, living: true }; return id;
}
