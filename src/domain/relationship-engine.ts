import type { Dataset, ParentType } from './person';
import { parentType, partnerDetail } from '../../public/assets/relationships.js';
import { connectionEdges } from './connections';

export type Direction = 'up' | 'down' | 'partner';
export interface RelationshipStep {
  from: string; to: string; direction: Direction;
  parentType?: ParentType; marriage?: boolean; ended?: boolean; currentlyMarried?: boolean;
}
export interface RelationshipSegment {
  from: string; to: string; direction: Direction; steps: RelationshipStep[];
}
export interface RelationshipExplanation {
  from: string; to: string; segments: RelationshipSegment[]; edgeCount: number;
}
// Adoption remains an ancestry step but is retained in the structured evidence.
// Guardianship/other social relations and partnerships are always separate steps.
export function continuation(step: RelationshipStep): string {
  return step.direction !== 'partner' && !['guardian', 'other'].includes(step.parentType || '') ? step.direction : '';
}
export function reduceRelationship(steps: RelationshipStep[]): RelationshipSegment[] {
  const segments: RelationshipSegment[] = [];
  for (const step of steps) {
    const last = segments.at(-1);
    if (last && continuation(step) && continuation(last.steps.at(-1)!) === continuation(step)) {
      last.to = step.to; last.steps.push(step);
    } else segments.push({ from: step.from, to: step.to, direction: step.direction, steps: [step] });
  }
  return segments;
}

// A station contains one maximal up* down* ancestry section, or one social/partner step.
// Keep directional segments in explain() as the original, unabridged evidence.
export function relationshipStations(steps: RelationshipStep[]): RelationshipSegment[] {
  const stations: RelationshipSegment[] = [];
  for (const step of steps) {
    const last = stations.at(-1), direction = continuation(step);
    const previous = last ? continuation(last.steps.at(-1)!) : '';
    if (last && direction && previous && !(previous === 'down' && direction === 'up')) {
      last.to = step.to; last.steps.push(step);
    } else stations.push({ from: step.from, to: step.to, direction: step.direction, steps: [step] });
  }
  return stations;
}

interface Label {
  id: string; last: string; previousParent: string; segments: number; edges: number;
  signature: string; path: RelationshipStep[];
}
const compare = (a: Label, b: Label) => a.segments - b.segments || a.edges - b.edges
  || (a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0);
const key = (id: string, last: string, previousParent = '') => JSON.stringify([id, last, previousParent]);

export function relationshipEngine(data: Dataset) {
  const graph = new Map(Object.keys(data.people).map(id => [id, [] as RelationshipStep[]]));
  for (const edge of connectionEdges(data)) {
    if (edge.kind === 'parent') {
      const type = parentType(data.people, edge.a, edge.b) as ParentType;
      graph.get(edge.a)!.push({ from: edge.a, to: edge.b, direction: 'down', parentType: type });
      graph.get(edge.b)!.push({ from: edge.b, to: edge.a, direction: 'up', parentType: type });
    } else {
      const a = partnerDetail(data.people, edge.a, edge.b), b = partnerDetail(data.people, edge.b, edge.a);
      const statuses = [a.status, b.status];
      const marriage = a.kind === 'marriage' || statuses.some(s => ['verheiratet', 'geschieden', 'verwitwet'].includes(s));
      const ended = Boolean(a.end || b.end || statuses.some(s => ['geschieden', 'verwitwet'].includes(s)));
      const currentlyMarried = !ended && statuses.includes('verheiratet');
      graph.get(edge.a)!.push({ from: edge.a, to: edge.b, direction: 'partner', marriage, ended, currentlyMarried });
      graph.get(edge.b)!.push({ from: edge.b, to: edge.a, direction: 'partner', marriage, ended, currentlyMarried });
    }
  }
  const cache = new Map<string, Map<string, Label>>();
  function search(start: string) {
    if (cache.has(start)) return cache.get(start)!;
    const initial: Label = { id: start, last: '', previousParent: '', segments: 0, edges: 0, signature: '', path: [] };
    const best = new Map<string, Label>([[key(start, ''), initial]]), answers = new Map<string, Label>();
    const queue = [initial];
    // Dijkstra on (person, last direction, previous parent after a down step). Lexicographic positive
    // cost: up* down* stations, then raw edges, then stable path signature.
    // Down then up starts a second station: a recorded partnership (one station)
    // therefore beats the two-edge route through a shared child. No path
    // enumeration, depth cutoff or heuristic pruning. One search serves all targets.
    while (queue.length) {
      queue.sort(compare); const current = queue.shift()!;
      if (best.get(key(current.id, current.last, current.previousParent)) !== current) continue;
      if (!answers.has(current.id)) answers.set(current.id, current);
      for (const step of graph.get(current.id) || []) {
        // Reversing the same edge cannot add genealogical information.
        if (current.path.at(-1)?.from === step.to) continue;
        const direction = continuation(step);
        const wasDescending = current.last === 'down' || current.last === 'upDown';
        const last = direction === 'down' && ['up', 'upDown'].includes(current.last) ? 'upDown' : direction;
        const sharedChildDetour = current.last === 'upDown' && direction === 'up'
          && (data.people[current.previousParent]?.partners?.includes(step.to)
            || data.people[step.to]?.partners?.includes(current.previousParent));
        // Penalise child bridges after a collateral (up→down) section. A pure
        // descendant section has a meaningful pivot of its own (e.g. grandson),
        // and must not be displaced by a route through that person's parents.
        // One unit ties the partnership route; fewer raw edges then prefer it.
        // A larger surcharge can make backtracking artificially cheaper.
        const detourCost = sharedChildDetour ? 1 : 0;
        const candidate: Label = { id: step.to, last, previousParent: direction === 'down' ? step.from : '',
          segments: current.segments + (direction && current.last && !(wasDescending && direction === 'up') ? 0 : 1) + detourCost,
          edges: current.edges + 1,
          signature: current.signature + JSON.stringify([step.to, step.direction, step.parentType || '']),
          path: [...current.path, step],
        };
        const state = key(candidate.id, last, candidate.previousParent), previous = best.get(state);
        if (!previous || compare(candidate, previous) < 0) { best.set(state, candidate); queue.push(candidate); }
      }
    }
    cache.set(start, answers); return answers;
  }
  return {
    explain(from: string, to: string): RelationshipExplanation | null {
      if (!graph.has(from) || !graph.has(to)) return null;
      const result = search(from).get(to);
      return result ? { from, to, segments: reduceRelationship(result.path), edgeCount: result.edges } : null;
    },
  };
}
