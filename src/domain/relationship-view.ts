import { parentType, partnerDetail } from '../../public/assets/relationships.js';
import type { Dataset, ParentType, PartnerDetail } from './person';
import { parentDescription, partnershipDescription, siblingDescription } from '../../public/assets/relationship-text.js';
export type LineStyle = 'default' | 'adoptive' | 'guardian' | 'other' | 'unmarried' | 'ended';
export const lineLabel: Record<LineStyle, string> = {
  default: 'familyConnection', adoptive: 'familyAdoptive', guardian: 'familyGuardian', other: 'familyOther', unmarried: 'familyUnmarried', ended: 'familyEndedPartnership',
};

export function parentStyle(dataset: Dataset, parent: string, child: string): LineStyle {
  const type = parentType(dataset.people, parent, child) as ParentType;
  return ['adoptive', 'guardian', 'other'].includes(type) ? type as LineStyle : 'default';
}

export function childConnection(dataset: Dataset, parents: string[], child: string): {
  style: LineStyle; annotations: { parent: string; style: LineStyle }[];
} {
  const edges = parents.map(parent => ({ parent, style: parentStyle(dataset, parent, child) }));
  const styles = new Set(edges.map(edge => edge.style));
  // A common special style applies only when every edge carries it. Otherwise
  // identify the actual special parent beside the single, neutral child stem.
  return styles.size <= 1 ? { style: edges[0]?.style || 'default', annotations: [] }
    : { style: 'default', annotations: edges.filter(edge => edge.style !== 'default') };
}

export function partnerStyle(dataset: Dataset, a: string, b: string): LineStyle {
  const own = partnerDetail(dataset.people, a, b) as PartnerDetail;
  const other = partnerDetail(dataset.people, b, a) as PartnerDetail;
  if (own.end || own.status === 'geschieden' || other.status === 'geschieden' || own.status === 'verwitwet' || other.status === 'verwitwet') return 'ended';
  if (own.status === 'partner' || other.status === 'partner') return 'unmarried';
  if (own.status === 'verheiratet' || other.status === 'verheiratet') return 'default';
  if (own.kind === 'partnership') return 'unmarried';
  return 'default';
}

// One person-dialog projection for graph, chronicle, sources and map.
import { familyIndex, siblingsFor } from './family';
import { orderedPartners } from '../../public/assets/relationships.js';
export function personRelations(dataset: Dataset, id: string, t: { get(key: string, values?: Record<string, string | number>): string }) {
  const person = dataset.people[id]; if (!person) return [];
  const index = familyIndex(dataset);
  const byName = (ids: string[] = []) => [...new Set(ids)].sort((a, b) => (dataset.people[a]?.name || a).localeCompare(dataset.people[b]?.name || b));
  return [
    { key: 'relParents', items: byName(person.parents).map(parent => ({ id: parent, description: parentDescription(dataset, parent, id, t), sources: person.parentDetails?.[parent]?.sources })) },
    { key: 'relPartners', items: (orderedPartners(dataset.people, id) as string[]).map(partner => ({ id: partner, description: partnershipDescription(dataset, id, partner, t) })) },
    { key: 'relChildren', items: byName(index.children.get(id)).map(child => ({ id: child, description: parentDescription(dataset, id, child, t), sources: dataset.people[child].parentDetails?.[id]?.sources })) },
    { key: 'relSiblings', items: siblingsFor(index, id).map(sibling => ({ id: sibling.id, description: siblingDescription(dataset, id, sibling.id, sibling.sharedParents, t) })) },
  ];
}
