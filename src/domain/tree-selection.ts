import { computeVisible, computeHourglass, computeGenerations } from '../../public/assets/graph.js';
import { defaultRootIds } from '../../public/assets/view-config.js';
import type { Dataset } from './person';
import type { ArchiveConfig } from './archive';
import { familyIndex, selectFamily, projectFamily } from './family';

export const graphModes = ['family', 'hourglass', 'descendants', 'ancestors', 'connections'] as const;
export type GraphMode = typeof graphModes[number];
export const modeLabel: Record<GraphMode, string> = {
  family: 'graphFamily', hourglass: 'graphHourglass', descendants: 'graphDescendants', ancestors: 'graphAncestors', connections: 'tabConnections',
};

export function selectGraph(data: Dataset, center: string, mode: Exclude<GraphMode, 'connections'>, roots = [center]) {
  const index = familyIndex(data);
  if (mode === 'family') return { family: selectFamily(index, center), generations: undefined };
  let visible: Set<string>;
  if (mode === 'ancestors') {
    visible = new Set();
    const queue = [center];
    while (queue.length) {
      const id = queue.pop()!;
      if (!data.people[id] || visible.has(id)) continue;
      visible.add(id);
      queue.push(...(data.people[id].parents || []));
    }
  } else {
    visible = treeVisibility(data, { title: '' }, '', mode, roots, mode === 'descendants' ? center : null).visible;
  }
  return { family: projectFamily(index, center, visible), generations: computeGenerations(data.people, visible, center) as Map<string, number> };
}

// Shared with the historical compact adapter: selection stays independent of rendering.
export function treeVisibility(data: Dataset, config: ArchiveConfig, tree: string, mode: 'hourglass' | 'descendants', selected: string[], descendant: string | null) {
  const people = data.people;
  const inDesc = mode === 'descendants' && descendant && people[descendant] ? descendant : null;
  const configured = defaultRootIds(config, tree, data.meta.focusPersonId).filter((id: string) => people[id]) as string[];
  const chosen = selected.filter(id => people[id]);
  const hgRoots = chosen.length ? chosen : configured.length ? configured : [data.meta.focusPersonId];
  const hourglass = !inDesc;
  let visible: Set<string>;
  if (inDesc) visible = computeVisible(people, [inDesc], new Set());
  else visible = computeHourglass(people, hgRoots);
  const ref = inDesc || hgRoots[0];
  return { visible, ref, inDesc, hourglass, hgRoots };
}
