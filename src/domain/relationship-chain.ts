import type { Dataset } from './person';
import { parentType } from '../../public/assets/relationships.js';
import type { RelationshipExplanation, RelationshipStep } from './relationship-engine';
export interface RelationshipStation { people: string[]; steps: RelationshipStep[] }

// Find evidence for the same directed ancestry pattern, independently of the
// explanation optimizer (an alternative shorter route must not hide this proof).
function matchingPath(data: Dataset, from: string, to: string, pattern: RelationshipStep[]): RelationshipStep[] | null {
  let layer = new Map<string, RelationshipStep[]>([[from, []]]);
  const kind = (type: string | undefined) => !type || ['unknown', 'biological'].includes(type) ? 'parent' : type;
  for (const reference of pattern) {
    if (reference.direction === 'partner' || ['guardian', 'other'].includes(reference.parentType || '')) return null;
    const next = new Map<string, RelationshipStep[]>();
    for (const [id, path] of layer) {
      const candidates = reference.direction === 'up' ? data.people[id]?.parents || []
        : Object.keys(data.people).filter(child => data.people[child].parents?.includes(id));
      for (const other of [...candidates].sort()) {
        if (!data.people[other] || other === from || path.some(step => step.from === other || step.to === other)) continue;
        const type = parentType(data.people, reference.direction === 'up' ? other : id, reference.direction === 'up' ? id : other);
        if (kind(type) !== kind(reference.parentType) || next.has(other)) continue;
        next.set(other, [...path, { from: id, to: other, direction: reference.direction, parentType: type }]);
      }
    }
    layer = next;
  }
  return layer.get(to) || null;
}

export function relationshipChain(data: Dataset, explanation: RelationshipExplanation): RelationshipStation[] {
  const stations: RelationshipStation[] = [{ people: [explanation.from], steps: [] }, ...explanation.segments.map(s => ({ people: [s.to], steps: [...s.steps] }))];
  const occupied = new Set(explanation.segments.flatMap(s => s.steps.flatMap(step => [step.from, step.to])));
  for (let i = 1; i < stations.length - 1; i++) {
    const id = stations[i].people[0], incoming = explanation.segments[i - 1], outgoing = explanation.segments[i];
    // A spouse transition is not shared parentage. Never turn a later spouse
    // into an ancestor or merge a chosen endpoint into a pair.
    if (incoming.direction === 'partner' || outgoing.direction === 'partner') continue;
    const partners = [...new Set([...(data.people[id]?.partners || []), ...Object.keys(data.people).filter(p => data.people[p].partners?.includes(id))])].sort();
    for (const partner of partners) {
      if (!data.people[partner] || occupied.has(partner)) continue;
      const before = stations[i - 1].people.map(from => matchingPath(data, from, partner, incoming.steps));
      const after = matchingPath(data, partner, stations[i + 1].people[0], outgoing.steps);
      if (before.some(path => !path) || !after) continue;
      stations[i].people = [id, partner].sort();
      // Preserve explicit adoption evidence from both members. Step count for
      // labels remains the original segment's length, not the evidence union.
      stations[i].steps.push(...before.flatMap(path => path!));
      stations[i + 1].steps.push(...after);
      occupied.add(partner);
      break; // One documented pair per station; no invented multi-partner union.
    }
  }
  return stations;
}
