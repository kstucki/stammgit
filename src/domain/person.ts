export interface Source { label?: string; url: string }
export interface SourceDetails {
  id?: string;
  title: string;
  citation?: string;
  original?: string;
  archive?: string;
  retrieved?: string;
  kind?: string;
  scope?: string;
  /** Website organisation only; never printed in evidence PDFs or the source ZIP. */
  tags?: string[];
}
export type ParentType = 'biological' | 'adoptive' | 'guardian' | 'other' | 'unknown';
export interface ParentDetail { type?: ParentType; label?: string; sources?: Source[] }
export interface PartnerDetail { status?: string; kind?: 'marriage' | 'partnership' | 'unknown'; start?: string; end?: string }
/** Assesses both the person and their placement in the recorded lineage. */
export type EvidenceStatus = 'unsicher' | 'gut' | 'gesichert';

export interface Person {
  evidenceStatus?: EvidenceStatus;
  name?: string;
  displayName?: string;
  /** Family name at birth (Ledigname); the name field may carry an alliance name such as «Sample-Smith». */
  birthSurname?: string;
  /** false = deceased (also without known death date); true = living. Persons born before 1920 count as deceased. */
  living?: boolean;
  birth?: string;
  death?: string;
  birthPlace?: string;
  deathPlace?: string;
  occupation?: string;
  occupation_pt?: string;
  occupation_en?: string;
  photo?: string;
  /** m = Mann, f = Frau, d = Divers; omitted while unknown. */
  gender?: string;
  notes?: string[];
  notes_pt?: string[];
  notes_en?: string[];
  locations?: { label: string; value: string }[];
  sources?: Source[];
  /** Personal websites/profiles; not evidence and not part of the source collection. */
  links?: { label?: string; url: string }[];
  parents?: string[];
  children?: string[];
  partners?: string[];
  siblings?: string[];
  parentDetails?: Record<string, ParentDetail>;
  parentGroups?: string[][];
  partnerDetails?: Record<string, PartnerDetail>;
}
export type SourceCategory = 'familie' | 'auskuenfte' | 'forschung' | 'register' | 'todesanzeigen' | 'belege' | 'andere';
export interface Dataset {
  meta: { title?: string; focusPersonId: string; defaultAncestorDepth?: number; autoExpand?: string[] };
  people: Record<string, Person>;
  /** Document URL (canonical, without page anchor) → category; missing means 'andere'. */
  sourceCategories?: Record<string, SourceCategory>;
  /** Document metadata, keyed by canonical URL; preserved in full YAML/JSON backups. */
  sourceDetails?: Record<string, SourceDetails>;
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
  language?: string;
  chapters: Chapter[];
  variants?: Record<string, { language?: string; chapters: Chapter[] }>;
}

export function years(person: Person, born: string): string {
  const year = (value?: string) => String(value || '').match(/\d{4}/)?.[0] || '';
  const birth = year(person.birth), death = year(person.death);
  return birth && death ? `${birth}–${death}` : birth ? `${born} ${birth}` : death ? `† ${death}` : '';
}

/** Deliberate short label; full name remains the identity and editor value. */
export function displayPersonName(person: Person | undefined, fallback = ''): string {
  return person?.displayName?.trim() || person?.name || fallback;
}

export function findPeople(people: Dataset['people'], query: string): string[] {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const needle = normalize(query.trim());
  if (!needle) return [];
  return Object.keys(people).filter(id => [people[id].name || id, people[id].displayName || ''].some(value => normalize(value).includes(needle)))
    .sort((a, b) => (people[a].name || a).localeCompare(people[b].name || b) || a.localeCompare(b));
}

export function personHref(id: string, action: 'person' | 'edit' | 'family' | 'tree' | 'descendants' = 'person'): string {
  return `/?${new URLSearchParams({ view: action === 'family' ? 'family' : 'overview', person: id, action })}`;
}

export function chapterHref(file: string, language = ''): string {
  return `/?${new URLSearchParams({ view: 'chronicle', chapter: file, language })}`;
}
