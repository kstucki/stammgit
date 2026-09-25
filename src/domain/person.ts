export interface Source { label?: string; url: string }
export type ParentType = 'biological' | 'adoptive' | 'guardian' | 'other' | 'unknown';
export interface ParentDetail { type?: ParentType; label?: string; sources?: Source[] }
export interface PartnerDetail { status?: string; kind?: 'marriage' | 'partnership' | 'unknown'; start?: string; end?: string }
export interface Person {
  name?: string;
  birth?: string;
  death?: string;
  occupation?: string;
  photo?: string;
  gender?: string;
  notes?: string[];
  locations?: { label: string; value: string }[];
  sources?: Source[];
  parents?: string[];
  children?: string[];
  partners?: string[];
  siblings?: string[];
  parentDetails?: Record<string, ParentDetail>;
  parentGroups?: string[][];
  partnerDetails?: Record<string, PartnerDetail>;
}
export interface Dataset {
  meta: { title?: string; focusPersonId: string; defaultAncestorDepth?: number; autoExpand?: string[] };
  people: Record<string, Person>;
}
export interface Chapter {
  subtitle?: string;
  cover?: string;
  author?: string;
  year?: string;
  file: string;
  title: string;
  persons: string[];
  date?: string;
  sources?: string[];
  sections?: { id: string; text: string }[];
}
export interface ChronicleIndex {
  chapters: Chapter[];
}

export function years(person: Person, born: string): string {
  const year = (value?: string) => String(value || '').match(/\d{4}/)?.[0] || '';
  const birth = year(person.birth), death = year(person.death);
  return birth && death ? `${birth}–${death}` : birth ? `${born} ${birth}` : death ? `† ${death}` : '';
}

export function findPeople(people: Dataset['people'], query: string): string[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const needle = normalize(query.trim());
  if (!needle) return [];
  return Object.keys(people).filter(id => normalize(people[id].name || id).includes(needle))
    .sort((a, b) => (people[a].name || a).localeCompare(people[b].name || b) || a.localeCompare(b));
}

export function personHref(id: string, action: 'person' | 'edit' | 'family' | 'tree' | 'descendants' = 'person'): string {
  return `/?${new URLSearchParams({ view: action === 'family' ? 'family' : 'overview', person: id, action })}`;
}

export function chapterHref(file: string): string {
  return `/?${new URLSearchParams({ view: 'chronicle', chapter: file })}`;
}
