import type { Dataset } from './person';
import { parentGroups, orderedPartners, parentType } from '../../public/assets/relationships.js';

export interface FamilyGroup {
  id: string;
  adults: string[];
  children: string[];
  partnership: boolean;
}
export interface FamilySlice {
  center: string;
  people: string[];
  parents: string[];
  children: string[];
  partners: string[];
  siblings: { id: string; sharedParents: string[] }[];
  groups: FamilyGroup[];
  generationParents: { parent: string; child: string }[];
}
const unique = (ids: string[]) => [...new Set(ids)];
const stable = (ids: string[]) => unique(ids).sort();
export const familyKey = (adults: string[]) => JSON.stringify(stable(adults));

// Unknown parent types keep their ordinary layout constraint without claiming
// biological parenthood. Explicit social relationships do not fix generations.
function generationParents(dataset: Dataset, visible: Set<string>): FamilySlice['generationParents'] {
  return [...visible].flatMap(child => (dataset.people[child]?.parents || [])
    .filter(parent => visible.has(parent) && !['adoptive', 'guardian', 'other'].includes(parentType(dataset.people, parent, child)))
    .map(parent => ({ parent, child })));
}

// A read-only index of recorded links. It never uses legacy box pairing or
// derives parenthood from a partnership. No whole-tree layout is constructed.
export function familyIndex(dataset: Dataset) {
  const { people } = dataset;
  const children = new Map<string, string[]>();
  for (const [id, person] of Object.entries(people)) {
    for (const parent of person.parents || []) {
      children.set(parent, [...(children.get(parent) || []), id]);
    }
  }
  return { dataset, children };
}
export type FamilyIndex = ReturnType<typeof familyIndex>;

export function siblingsFor(index: FamilyIndex, id: string): FamilySlice['siblings'] {
  const { people } = index.dataset;
  if (!people[id]) return [];
  const parents = people[id].parents || [];
  const explicit = [...(people[id].siblings || []), ...Object.keys(people).filter(other => people[other].siblings?.includes(id))];
  const candidates = stable([...explicit, ...parents.flatMap(parent => index.children.get(parent) || [])]);
  return candidates.filter(other => other !== id && people[other] && (explicit.includes(other) || parents.some(parent =>
    people[other].parents?.includes(parent) && ![parentType(people, parent, id), parentType(people, parent, other)].some(type => ['guardian', 'other'].includes(type))
  ))).map(other => ({
    id: other, sharedParents: stable(parents.filter(parent => people[other].parents?.includes(parent))),
  }));
}

export function selectFamily(index: FamilyIndex, center: string): FamilySlice {
  const { people } = index.dataset;
  if (!Object.hasOwn(people, center)) throw new Error('Unknown family center.');
  const parents = stable(people[center].parents || []);
  const children = stable(index.children.get(center) || []);
  const partners = orderedPartners(people, center) as string[];
  const siblings = siblingsFor(index, center);
  const visible = new Set([center, ...parents, ...children, ...partners, ...siblings.map(sibling => sibling.id)]);
  const groups = new Map<string, FamilyGroup>();
  const group = (adults: string[]) => {
    const id = familyKey(adults);
    if (!groups.has(id)) groups.set(id, { id, adults: stable(adults), children: [], partnership: false });
    return groups.get(id)!;
  };
  for (const child of unique([center, ...children, ...siblings.map(sibling => sibling.id)])) {
    const constellations = parentGroups(people[child]) as string[][];
    for (const adults of constellations) {
      group(adults).children.push(child);
      adults.forEach(adult => visible.add(adult));
    }
  }
  for (const id of visible) {
    for (const partner of people[id].partners || []) {
      if (visible.has(partner)) group([id, partner]).partnership = true;
    }
  }
  return { center, parents, children, partners, siblings, people: stable([...visible]),
    generationParents: generationParents(index.dataset, visible),
    groups: [...groups.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

// Project an already selected view. Hidden parents stay hidden; the recorded
// constellation still owns the group's identity when only one adult is visible.
export function projectFamily(index: FamilyIndex, center: string, visible: Set<string>): FamilySlice {
  const people = index.dataset.people;
  const ids = stable([...visible].filter(id => people[id]));
  const groups = new Map<string, FamilyGroup>();
  const group = (parents: string[]) => {
    const id = familyKey(parents);
    if (!groups.has(id)) groups.set(id, { id, adults: stable(parents.filter(id => visible.has(id))), children: [], partnership: false });
    return groups.get(id)!;
  };
  for (const child of ids) {
    for (const parents of parentGroups(people[child]) as string[][]) {
      if (parents.some(parent => visible.has(parent))) group(parents).children.push(child);
    }
    for (const partner of people[child].partners || []) {
      if (visible.has(partner)) group([child, partner]).partnership = true;
    }
  }
  return { center, people: ids, parents: (people[center]?.parents || []).filter(id => visible.has(id)),
    children: (index.children.get(center) || []).filter(id => visible.has(id)),
    partners: (orderedPartners(people, center) as string[]).filter(id => visible.has(id)),
    siblings: siblingsFor(index, center).filter(s => visible.has(s.id)),
    generationParents: generationParents(index.dataset, visible),
    groups: [...groups.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}
