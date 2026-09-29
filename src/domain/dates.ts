import type { Person } from './person';
import { getT } from '../../public/assets/strings.js';
type Lang = 'de' | 'en';
const language = (lang?: string): Lang => lang?.startsWith('en') ? 'en' : 'de';
const months: Record<Lang, string[]> = {
  de: ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
function exact(raw: string): { year: string; month?: number; day?: number } | null {
  const iso = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(raw);
  const dotted = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(raw);
  if (!iso && !dotted) return null;
  const year = iso ? iso[1] : dotted![3];
  const month = iso ? iso[2] ? +iso[2] : undefined : +dotted![2];
  const day = iso ? iso[3] ? +iso[3] : undefined : +dotted![1];
  if (month !== undefined && (month < 1 || month > 12)) return null;
  if (day !== undefined) {
    const y = +year, leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    if (day < 1 || day > [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month! - 1]) return null;
  }
  return { year, month, day };
}
/** Date-only values never pass through a timezone. Unknown input stays intact. */
export function formatDate(raw: string | number | null | undefined, lang = 'de', style: 'short' | 'long' = 'short'): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const original = String(raw), value = original.trim(), code = language(lang), t = getT(code);
  const uncertain = /^(\d{4})\s*\?$/.exec(value);
  if (uncertain) return `${uncertain[1]}?`;
  const either = /^(\d{4})\s+od\.\s+(\d{4})$/.exec(value);
  if (either) return `${either[1]} ${t.get('dateOr')} ${either[2]}`;
  const qualified = /^(um|vor|nach)\s+(\d{4})$/.exec(value);
  if (qualified) return `${t.get(({ um: 'dateAbout', vor: 'dateBefore', nach: 'dateAfter' } as Record<string, string>)[qualified[1]]!)} ${qualified[2]}`;
  const date = exact(value);
  if (!date) return original;
  const { year, month, day } = date;
  if (!month) return year;
  if (!day) return `${months[code][month - 1]} ${year}`;
  if (code === 'de') return `${day}.${month}.${year}`;
  return `${day} ${months.en[month - 1]} ${year}`;
}
export function formatLifespan(person: Pick<Person, 'birth' | 'death'>, lang = 'de', style: 'card' | 'info' = 'card'): string {
  const code = language(lang);
  const display = (raw: Person['birth']) => {
    // Cards show years even when only one life event is known.
    // Keep uncertainty, alternatives and unknown formats intact.
    const value = style === 'card' ? exact(String(raw ?? '').trim())?.year ?? raw : raw;
    return formatDate(value, code, style === 'info' ? 'long' : 'short');
  };
  const birth = display(person.birth), death = display(person.death);
  if (birth && death) return style === 'card' ? `${birth}–${death}` : `${birth} – ${death}`;
  return birth ? `${getT(code).get('bornAbbr')} ${birth}` : death ? `† ${death}` : '';
}

/** One row per recorded life event. Places are stored verbatim, never translated. */
export function formatLifeEvents(person: Pick<Person, 'birth' | 'death' | 'birthPlace' | 'deathPlace'>, lang = 'de') {
  return (['birth', 'death'] as const).filter(kind => person[kind] || person[`${kind}Place`]).map(kind => ({
    kind,
    date: formatDate(exact(String(person[kind] ?? '').trim())?.year ?? person[kind], lang),
    prefix: kind === 'death' ? '†' : person.death || person.deathPlace ? '*' : getT(language(lang)).get('bornAbbr'),
    place: person[`${kind}Place`] || '',
  }));
}
