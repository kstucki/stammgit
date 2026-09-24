import { personSources } from '../../public/assets/relationships.js';
import type { Dataset } from './person';
export function sourceDocuments(people: Dataset['people']) {
  const docs = new Map<string, { labels: Map<string, number>; persons: string[] }>();
  for (const [id, person] of Object.entries(people)) for (const source of personSources(person)) {
    const entry = docs.get(source.url) || { labels: new Map<string, number>(), persons: [] };
    entry.labels.set(source.label || source.url, (entry.labels.get(source.label || source.url) || 0) + 1);
    if (!entry.persons.includes(id)) entry.persons.push(id);
    docs.set(source.url, entry);
  }
  return [...docs].map(([url, entry]) => ({ url, label: [...entry.labels].sort((a, b) => b[1] - a[1])[0][0],
    persons: entry.persons.sort((a, b) => (people[a].name || a).localeCompare(people[b].name || b, 'de')),
  })).sort((a, b) => a.label.localeCompare(b.label, 'de'));
}
export const personId = (name: string) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'person';
export function createPerson(data: Dataset, name: string) {
  const base = personId(name); let id = base, n = 2;
  while (Object.hasOwn(data.people, id)) id = `${base}_${n++}`;
  data.people[id] = { name }; return id;
}
