export type Language = 'de' | 'en';
export type Role = 'admin' | 'user';
export type ArchiveView = 'overview' | 'chronicle' | 'sources' | 'admin';

export interface ArchiveConfig {
  language?: Language;
  title: string;
  eyebrow?: string;
  defaultTree?: string;
  overview?: { heading?: string; intro?: string; note?: string; linesHeading?: string; defaultPersons?: string[]; extraLines?: { label: string; text: string; adminSuffix?: string; person?: string; persons?: string[] }[] };
}

export interface TreeSummary {
  id: string;
  title: string;
  people: number;
  contentHash?: string;
}

export interface TreeIndex {
  trees: TreeSummary[];
  defaultTree: string;
}

// A read-only landing-page snapshot, never an editable copy of the dataset.
export interface ArchiveSnapshot {
  config: ArchiveConfig;
  tree: TreeSummary;
  hasDraft: boolean;
  hasChronicle: boolean;
  role: Role;
  index?: TreeIndex;
  chronicle?: import('./person').ChronicleIndex | null;
}

export const viewHref = (view: ArchiveView): string => `/?view=${view}`;

export function availableViews(archive: ArchiveSnapshot): ArchiveView[] {
  return [
    ...(archive.hasChronicle ? ['chronicle' as const] : []),
    'sources',
    ...(archive.role === 'admin' ? ['admin' as const] : []),
  ];
}
