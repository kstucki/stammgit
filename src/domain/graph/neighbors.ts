import type { LayoutNode } from './types';

export interface NeighborConstraints {
  /** Unordered memberships only: never an age/YAML sorting instruction. */
  siblingGroups?: readonly (readonly string[])[];
  partners: readonly (readonly [string, string])[];
}

/** Repair partner adjacency once, starting from the established layout order.
 * Closest pairs have priority. Merge chain endpoints only, preserving already
 * accepted neighbors. Whole partner chains may move outside foreign sibling
 * groups; no age/YAML ordering runs inside the optimizer.
 */
export function arrangeNeighbors(layer: LayoutNode[], rules: NeighborConstraints): void {
  const index = new Map(layer.map((node, i) => [node.id, i]));
  let chains = layer.map(node => [node]);
  const pairs = rules.partners.filter(([a, b]) => a !== b && index.has(a) && index.has(b))
    .map(([a, b]) => [a, b].sort() as [string, string])
    .sort(([a, b], [c, d]) => Math.abs(index.get(a)! - index.get(b)!) - Math.abs(index.get(c)! - index.get(d)!)
      || a.localeCompare(c) || b.localeCompare(d));
  for (const [a, b] of pairs) {
    const left = chains.find(chain => chain.some(node => node.id === a))!;
    const right = chains.find(chain => chain.some(node => node.id === b))!;
    if (left === right) continue;
    const candidates: LayoutNode[][] = [];
    for (const first of [left, [...left].reverse()]) for (const second of [right, [...right].reverse()]) {
      if (first.at(-1)!.id === a && second[0].id === b) candidates.push([...first, ...second]);
      if (second.at(-1)!.id === b && first[0].id === a) candidates.push([...second, ...first]);
    }
    candidates.sort((x, y) => index.get(x[0].id)! - index.get(y[0].id)!);
    if (!candidates.length) continue;
    const position = Math.min(chains.indexOf(left), chains.indexOf(right));
    chains = chains.filter(chain => chain !== left && chain !== right);
    chains.splice(position, 0, candidates[0]);
  }
  chains = protectSiblingGroups(chains, rules.siblingGroups ?? []);
  layer.splice(0, layer.length, ...chains.flat());
}

/** Move an intrusive partner chain to either boundary of a foreign sibling
 * group. Never split a chain, reverse siblings, or worsen another sibling
 * group. Each accepted move strictly reduces interruptions, so this terminates
 * without optimizer rounds or size-dependent effort thresholds.
 */
function protectSiblingGroups(chains: LayoutNode[][], memberships: readonly (readonly string[])[]): LayoutNode[][] {
  const groups = memberships.map(ids => {
    const members = new Set(ids);
    return chains.filter(chain => chain.some(node => members.has(node.id)));
  }).filter(group => group.length > 1);
  if (!groups.length) return chains;
  const original = new Map(chains.flat().map((node, i) => [node.id, i]));
  const interruptions = (order: LayoutNode[][]) => groups.map(group => {
    const positions = group.map(chain => order.indexOf(chain));
    // Preserve the existing relative order of sibling-bearing chains.
    if (positions.some((position, i) => i > 0 && position <= positions[i - 1])) return Infinity;
    return positions.at(-1)! - positions[0] + 1 - group.length;
  });
  const displacement = (order: LayoutNode[][]) => order.flat().reduce((sum, node, i) => sum + Math.abs(i - original.get(node.id)!), 0);
  while (true) {
    const before = interruptions(chains), total = before.reduce((a, b) => a + b, 0);
    let best: LayoutNode[][] | undefined, bestScore = total, bestDistance = Infinity;
    for (const group of groups) {
      const first = chains.indexOf(group[0]), last = chains.indexOf(group.at(-1)!);
      for (let i = first + 1; i < last; i++) {
        const chain = chains[i];
        if (chain.length < 2 || group.includes(chain)) continue;
        const rest = chains.filter(other => other !== chain);
        for (const at of [rest.indexOf(group[0]), rest.indexOf(group.at(-1)!) + 1]) {
          const proposal = [...rest.slice(0, at), chain, ...rest.slice(at)];
          const after = interruptions(proposal);
          if (after.some((count, g) => count > before[g])) continue;
          const score = after.reduce((a, b) => a + b, 0);
          if (score >= total) continue;
          const distance = displacement(proposal);
          if (score < bestScore || (score === bestScore && distance < bestDistance)) {
            best = proposal; bestScore = score; bestDistance = distance;
          }
        }
      }
    }
    if (!best) return chains;
    chains = best;
  }
}

/** Keep adjacent partners physically close as well as adjacent in the order. */
export function compactPartnerNeighbors(layer: LayoutNode[], rules: NeighborConstraints, gap: number): void {
  if (!layer.length) return;
  const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());
  const partners = new Set(rules.partners.map(([a, b]) => pairKey(a, b)));
  const groups: LayoutNode[][] = [];
  for (const node of layer) {
    const last = groups.at(-1), previous = last?.at(-1);
    if (previous && partners.has(pairKey(previous.id, node.id))) last!.push(node);
    else groups.push([node]);
  }
  // Rigid adjacent couples/chains retain their mean position. Resolve overlaps
  // symmetrically, as in the original relaxation, without reopening the order.
  const widths = groups.map(group => group.reduce((sum, node) => sum + node.w, 0) + gap * (group.length - 1));
  const desired = groups.map((group, i) => {
    let offset = -widths[i] / 2;
    return group.reduce((sum, node) => {
      const center = offset + node.w / 2;
      offset += node.w + gap;
      return sum + node.x - center;
    }, 0) / group.length;
  });
  const left: number[] = [], right: number[] = [];
  let edge = -Infinity;
  for (let i = 0; i < groups.length; i++) {
    left[i] = Math.max(desired[i], edge + widths[i] / 2);
    edge = left[i] + widths[i] / 2 + gap;
  }
  edge = Infinity;
  for (let i = groups.length - 1; i >= 0; i--) {
    right[i] = Math.min(desired[i], edge - widths[i] / 2);
    edge = right[i] - widths[i] / 2 - gap;
  }
  groups.forEach((group, i) => {
    let x = (left[i] + right[i]) / 2 - widths[i] / 2;
    for (const node of group) { node.x = x + node.w / 2; x += node.w + gap; }
  });
}
