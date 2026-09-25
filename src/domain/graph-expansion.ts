import type { FamilySlice } from './family';
import { familyIndex, projectFamily } from './family';
import type { Dataset } from './person';

export type Direction = 'parents' | 'children' | 'partners';
export interface Expansion { id: string; direction: Direction }
export const directions: Direction[] = ['parents', 'children', 'partners'];

export function hiddenRelatives(data: Dataset, family: FamilySlice) {
  const index = familyIndex(data), visible = new Set(family.people);
  return new Map(family.people.map(id => [id, Object.fromEntries(directions.map(direction => {
    const ids = direction === 'children' ? index.children.get(id) || [] : data.people[id]?.[direction] || [];
    return [direction, [...new Set(ids)].filter(other => data.people[other] && !visible.has(other))];
  })) as Record<Direction, string[]>]));
}

// Replay explicit one-hop expansions only. Preserve the base graph's filtered
// memberships: merely making another person visible must not restore side loops.
export function expandGraph(data: Dataset, base: FamilySlice, steps: Expansion[]): FamilySlice {
  const index = familyIndex(data);
  let family = base;
  for (const { id, direction } of steps) {
    const targets = hiddenRelatives(data, family).get(id)?.[direction] || [];
    if (!targets.length) continue;
    const visible = new Set([...family.people, ...targets]);
    const projected = projectFamily(index, base.center, visible);
    const groups = new Map(family.groups.map(group => [group.id, { ...group, adults: [...group.adults], children: [...group.children] }]));
    for (const candidate of projected.groups) {
      const children = direction === 'parents' && candidate.children.includes(id) && candidate.adults.some(a => targets.includes(a)) ? [id]
        : direction === 'children' && candidate.adults.includes(id) ? candidate.children.filter(c => targets.includes(c)) : [];
      const partnership = direction === 'partners' && candidate.partnership && candidate.adults.includes(id) && candidate.adults.some(a => targets.includes(a));
      if (!children.length && !partnership) continue;
      const previous = groups.get(candidate.id);
      groups.set(candidate.id, { ...candidate,
        adults: [...new Set([...(previous?.adults || []), ...candidate.adults])].sort(),
        children: [...new Set([...(previous?.children || []), ...children])].sort(),
        partnership: previous?.partnership || candidate.partnership,
      });
    }
    const result = [...groups.values()].sort((a, b) => a.id.localeCompare(b.id));
    family = { ...projected, groups: result, generationParents: projected.generationParents.filter(({ parent, child }) =>
      result.some(group => group.adults.includes(parent) && group.children.includes(child))) };
  }
  return family;
}
