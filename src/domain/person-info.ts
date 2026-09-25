import type { Dataset, Person } from './person';
import { personRelations } from './relationship-view';
import { partnerDetail } from '../../public/assets/relationships.js';
type T = { get(key: string, values?: Record<string, string | number>): string };
export function personInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map(word => [...word][0] || '').join('').toLocaleUpperCase();
}
export function personSubtitle(person: Person): string {
  const dates = person.birth ? `${person.birth} –${person.death ? ` ${person.death}` : ''}` : person.death ? `† ${person.death}` : '';
  return [dates, person.occupation].filter(Boolean).join(' · ');
}
// Existing evidence levels are explicit annotations in notes, not a model field.
// Level 1 is a direct source; level 2 is a database finding with originals unchecked.
export function lowEvidence(person: Person): boolean {
  return (person.notes || []).some(note => /\bBelegstufe\s*[2-9]\b/i.test(note));
}
export function familyChips(dataset: Dataset, id: string, t: T) {
  return personRelations(dataset, id, t).flatMap(section => {
    const groups = new Map<string, { key: string; label: string; items: { id: string; name: string; annotation: string; description: string }[] }>();
    for (const item of section.items) {
      let label = t.get(section.key), annotation = item.description;
      if (section.key === 'relPartners') {
        const detail = partnerDetail(dataset.people, id, item.id), reverse = partnerDetail(dataset.people, item.id, id);
        const marriage = [detail, reverse].some(d => d.kind === 'marriage' || ['verheiratet', 'geschieden', 'verwitwet'].includes(d.status || ''));
        const ended = [detail, reverse].some(d => d.end || ['geschieden', 'verwitwet'].includes(d.status || ''));
        label = t.get(marriage ? ended ? 'infoFormerMarriage' : 'infoMarriage' : ended ? 'infoFormerPartner' : 'relPartners');
        annotation = '';
      } else if (section.key === 'relSiblings') {
        annotation = item.description === t.get('familyHalfSibling') ? item.description : '';
      } else if (annotation === t.get('familyBiological')) annotation = '';
      const key = `${section.key}:${label}`;
      const group = groups.get(key) || { key, label, items: [] };
      const name = dataset.people[item.id]?.name || item.id;
      group.items.push({ id: item.id, name, annotation, description: item.description });
      groups.set(key, group);
    }
    return [...groups.values()];
  });
}
