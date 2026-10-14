import type { Dataset } from './person';

export const cleanFamilyTag = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ');
const key = (value: string) => cleanFamilyTag(value).toLocaleLowerCase('de');
export function familyTags(data: Dataset): string[] {
  return [...new Map(Object.values(data.sourceDetails || {}).flatMap(detail => detail.tags || [])
    .map(tag => [key(tag), cleanFamilyTag(tag)])).values()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'de'));
}
export function canonicalFamilyTag(value: string, existing: string[]): string {
  return existing.find(tag => key(tag) === key(value)) || cleanFamilyTag(value);
}
export function similarFamilyTags(value: string, existing: string[]): string[] {
  const a = key(value);
  if (a.length < 3) return [];
  return existing.filter(tag => {
    const b = key(tag);
    if (a === b) return false;
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
      row = next;
    }
    return row[b.length] <= (a.length >= 7 ? 2 : 1);
  });
}
