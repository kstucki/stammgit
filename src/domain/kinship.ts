import type { Dataset } from './person';
import { relationshipEngine, relationshipStations } from './relationship-engine';
import type { RelationshipExplanation, RelationshipSegment, RelationshipStep } from './relationship-engine';
import { relationshipChain } from './relationship-chain';
type T = { get(key: string, vars?: Record<string, string | number>): string };
export interface PairDescription { a: string; b: string; heading: string; chain: string[]; sentence?: string; message?: string }

// Labels always describe the newly named station relative to the preceding one.
export function formatRelationship(data: Dataset, explanation: RelationshipExplanation, t: T): string[] {
  const name = (id: string) => data.people[id]?.name || id;
  const sex = (id: string) => ['m', 'f'].includes(data.people[id]?.gender || '') ? data.people[id].gender! : 'u';
  return relationshipChain(data, explanation).map((station, i) => {
    const names = station.people.map(name).join(t.get('chainAnd'));
    if (!i) return names;
    const segment = explanation.segments[i - 1], first = segment.steps[0], depth = segment.steps.length;
    let relation: string;
    if (first.direction === 'partner') relation = t.get(first.marriage ? first.ended ? 'chainFormerSpouse' : first.currentlyMarried ? 'chainSpouse' : 'chainRecordedMarriage' : first.ended ? 'chainFormerPartner' : 'chainPartner');
    else if (['guardian', 'other'].includes(first.parentType || '')) relation = t.get(first.direction === 'up' ? 'chainSocialUp' : 'chainSocialDown', {
      type: t.get(first.parentType === 'guardian' ? 'familyGuardian' : 'familyOther'),
    });
    else relation = t.get(`rel${segment.direction === 'up' ? 'Ancestor' : 'Descendant'}${Math.min(depth, 5)}_${station.people.length > 1 ? 'plural' : sex(station.people[0])}`, { n: depth - 2 });
    const adoptions = [...new Set(station.steps.filter(step => step.parentType === 'adoptive').map(step => t.get('relAdoption', {
      child: name(step.direction === 'up' ? step.from : step.to), parent: name(step.direction === 'up' ? step.to : step.from),
    })))];
    return `${names} (${[relation, ...adoptions].join('; ')})`;
  });
}

interface Term { label: string; apposition: string }
interface Atom { from: string; to: string; term: Term; steps: RelationshipStep[] }
const gender = (data: Dataset, id: string) => ['m', 'f'].includes(data.people[id]?.gender || '') ? data.people[id].gender! : 'u';

function term(data: Dataset, id: string, key: string, t: T, vars: Record<string, string | number> = {}): Term {
  const sex = gender(data, id), label = t.get(`${key}_${sex}`, vars);
  // Apposition needs dative inflection in German; neutral combined terms omit
  // the article. The translation owns the grammar, including long lineages.
  return { label, apposition: t.get(`${key}App_${sex}`, { ...vars, label }) };
}
function direct(data: Dataset, id: string, direction: 'up' | 'down', depth: number, t: T): Term {
  const key = `rel${direction === 'up' ? 'Ancestor' : 'Descendant'}${Math.min(depth, 5)}`;
  const sex = gender(data, id), label = t.get(`${key}_${sex}`, { n: depth - 2 });
  return { label, apposition: t.get(depth >= 5 ? `kinLongApp_${sex}` : `kinApp_${sex}`, { label, n: depth - 2,
    noun: t.get(`rel${direction === 'up' ? 'Ancestor' : 'Descendant'}3_${sex}`) }) };
}
function sameLevel(data: Dataset, from: string, to: string, depth: number, t: T): Term {
  if (depth === 1) {
    const a = [...new Set(data.people[from]?.parents || [])], b = [...new Set(data.people[to]?.parents || [])];
    const half = a.length === 2 && b.length === 2 && a.filter(id => b.includes(id)).length === 1;
    return term(data, to, half ? 'kinHalfSibling' : 'kinSibling', t);
  }
  return term(data, to, depth === 2 ? 'kinCousin' : 'kinCousinDegree', t, { n: depth - 1 });
}

// Expand an offset section using only people on the actual selected path.
// These grammatical anchors do not alter the station count used by the engine.
export function bloodTerms(data: Dataset, station: RelationshipSegment, t: T): Atom[] {
  const steps = station.steps, a = steps.filter(s => s.direction === 'up').length, b = steps.length - a;
  const atom = (from: string, to: string, value: Term, evidence = steps): Atom => ({ from, to, term: value, steps: evidence });
  if (!a || !b) return [atom(station.from, station.to, direct(data, station.to, a ? 'up' : 'down', a || b, t))];
  if (a === b) return [atom(station.from, station.to, sameLevel(data, station.from, station.to, a, t))];
  if (a === 2 && b === 1 || a === 1 && b === 2) return [atom(station.from, station.to, term(data, station.to, a > b ? 'kinUncle' : 'kinNephew', t))];
  const split = a > b ? a - b : 2 * a, pivot = steps[split - 1].to;
  const left = steps.slice(0, split), right = steps.slice(split);
  return a > b
    ? [atom(station.from, pivot, direct(data, pivot, 'up', a - b, t), left), atom(pivot, station.to, sameLevel(data, pivot, station.to, b, t), right)]
    : [atom(station.from, pivot, sameLevel(data, station.from, pivot, a, t), left), atom(pivot, station.to, direct(data, station.to, 'down', b - a, t), right)];
}
function stationTerms(data: Dataset, station: RelationshipSegment, t: T): Atom[] {
  const step = station.steps[0];
  if (step.direction === 'partner') {
    const key = step.marriage ? step.ended ? 'kinFormerSpouse' : 'kinSpouse' : step.ended ? 'kinFormerPartner' : 'kinPartner';
    const value = term(data, station.to, key, t);
    if (step.marriage && !step.ended && !step.currentlyMarried) {
      value.label += ` (${t.get('chainRecordedMarriage')})`;
      value.apposition += ` (${t.get('chainRecordedMarriage')})`;
    }
    return [{ from: station.from, to: station.to, term: value, steps: station.steps }];
  }
  if (['guardian', 'other'].includes(step.parentType || '')) {
    const label = t.get(step.direction === 'up' ? 'chainSocialUp' : 'chainSocialDown', { type: t.get(step.parentType === 'guardian' ? 'familyGuardian' : 'familyOther') });
    return [{ from: station.from, to: station.to, term: { label, apposition: label }, steps: station.steps }];
  }
  return bloodTerms(data, station, t);
}
function evidence(data: Dataset, steps: RelationshipStep[], t: T): string {
  const names = (id: string) => data.people[id]?.name || id;
  const notes = [...new Set(steps.filter(step => step.parentType === 'adoptive').map(step => t.get('relAdoption', {
    child: names(step.direction === 'up' ? step.from : step.to), parent: names(step.direction === 'up' ? step.to : step.from),
  })))];
  return notes.length ? ` (${notes.join('; ')})` : '';
}
function phrase(data: Dataset, atoms: Atom[], t: T): string {
  const name = (id: string) => data.people[id]?.name || id;
  return [...atoms].reverse().map((atom, index) => t.get('kinOf', {
    term: (index ? atom.term.apposition : atom.term.label) + evidence(data, atom.steps, t), name: name(atom.from),
  })).join(', ');
}
export function formatKinship(data: Dataset, explanation: RelationshipExplanation, t: T): { sentence?: string; relation?: string; chain: string[] } {
  const stations = relationshipStations(explanation.segments.flatMap(s => s.steps));
  const atoms = stations.map(station => stationTerms(data, station, t));
  const name = (id: string) => data.people[id]?.name || id;
  if (!stations.length) return { chain: [name(explanation.from)] };
  if (stations.length <= 2) {
    const relation = phrase(data, atoms.flat(), t);
    return { chain: [], relation, sentence: t.get('kinSentence', { name: name(explanation.to), relation }) };
  }
  return { chain: [name(explanation.from), ...stations.map((station, i) => {
    const terms = atoms[i], label = terms.length === 1 ? terms[0].term.label + evidence(data, terms[0].steps, t) : phrase(data, terms, t);
    return `${name(station.to)} (${label})`;
  })] };
}

export function describeConnections(data: Dataset, selection: string[], t: T): PairDescription[] {
  const selected = [...new Set(selection)].filter(id => data.people[id]);
  if (selected.length < 2) return [];
  const [a, ...targets] = selected, engine = relationshipEngine(data);
  return targets.map(b => {
    const explanation = engine.explain(a, b), names = { a: data.people[a].name || a, b: data.people[b].name || b };
    return { a, b, heading: t.get('chainHeading', names), ...(explanation ? formatKinship(data, explanation, t) : { chain: [] }),
      message: explanation ? undefined : t.get('kinDisconnected', names) };
  });
}
