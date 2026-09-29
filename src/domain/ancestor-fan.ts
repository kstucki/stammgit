import type { Dataset } from './person';

export interface FanSlot {
  number: number; generation: number; index: number; id?: string;
  unknownType: boolean; issue?: 'ambiguous' | 'cycle';
}
export function fanDepth(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.min(10, Math.floor(value))) : 5;
}
/** Fixed ancestry positions, not unique people. Repeat ancestors retain every path. */
export function ancestorFan(data: Dataset, center: string, requestedDepth = 5): FanSlot[] {
  const depth = fanDepth(requestedDepth), slots: FanSlot[] = [];
  function visit(id: string | undefined, generation: number, index: number, path: Set<string>, unknownType = false) {
    const person = id ? data.people[id] : undefined;
    if (!person) id = undefined;
    const cycle = !!id && path.has(id);
    const eligible = person && !cycle ? [...new Set(person.parents || [])].filter(parent => {
      const type = person.parentDetails?.[parent]?.type;
      return !type || type === 'unknown' || type === 'biological';
    }) : [];
    const ambiguous = eligible.length > 2;
    slots.push({ number: 2 ** generation + index, generation, index, id, unknownType,
      ...(cycle ? { issue: 'cycle' as const } : ambiguous ? { issue: 'ambiguous' as const } : {}) });
    if (generation >= depth) return;
    const parents: (string | undefined)[] = ambiguous ? [] : [...eligible];
    // Recorded gender can reserve the customary left/right position. Otherwise
    // keep recorded order; never infer sex or a biological relationship.
    if (parents.length === 1 && data.people[parents[0]!]?.gender === 'f') parents.unshift(undefined);
    else if (parents.length === 2) {
      const [a, b] = parents.map(parent => parent ? data.people[parent]?.gender : undefined);
      if ((a === 'f' && b !== 'f') || (b === 'm' && a !== 'm')) parents.reverse();
    }
    const nextPath = new Set(path); if (id) nextPath.add(id);
    for (let side = 0; side < 2; side++) {
      const parent = parents[side];
      visit(parent, generation + 1, index * 2 + side, nextPath,
        !!parent && person?.parentDetails?.[parent]?.type !== 'biological');
    }
  }
  visit(center, 0, 0, new Set());
  return slots.sort((a, b) => a.number - b.number);
}

export const FAN_CORE = 105, FAN_RING = 190, FAN_PAD = 24;
export function fanGeometry(generation: number, index: number) {
  const inner = FAN_CORE + (generation - 1) * FAN_RING, outer = inner + FAN_RING;
  const span = Math.PI / 2 ** generation;
  const start = -Math.PI + index * span, end = start + span;
  const point = (r: number, angle: number) => `${r * Math.cos(angle)},${r * Math.sin(angle)}`;
  const angle = (start + end) / 2, radius = (inner + outer) / 2;
  return {
    path: `M${point(inner, start)} L${point(outer, start)} A${outer},${outer} 0 0 1 ${point(outer, end)} L${point(inner, end)} A${inner},${inner} 0 0 0 ${point(inner, start)} Z`,
    x: radius * Math.cos(angle), y: radius * Math.sin(angle),
    rotation: angle * 180 / Math.PI + (angle < -Math.PI / 2 ? 180 : 0),
    narrow: radius * (end - start) < 36,
  };
}
export function fanNameLines(name: string, single = false): string[] {
  const width = 24, max = single ? 1 : 2, words = name.trim().split(/\s+/), lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, max).map((text, i) => text.length > width || (i === max - 1 && lines.length > max) ? text.slice(0, width - 1) + '…' : text);
}
