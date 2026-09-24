// Readable annotations shared by the native and transition person windows.
// Missing information produces no label.
import { parentType, partnerDetail } from "./relationships.js";

export function parentDescription(dataset, parent, child, t) {
  const detail = dataset.people[child].parentDetails?.[parent];
  const keys = { biological: 'familyBiological', adoptive: 'familyAdoptive', guardian: 'familyGuardian' };
  return detail?.type === 'other' ? detail.label || '' : keys[detail?.type || ''] ? t.get(keys[detail.type]) : '';
}

export function partnershipDescription(dataset, owner, other, t) {
  const detail = partnerDetail(dataset.people, owner, other);
  const statuses = { verheiratet: 'statusMarried', geschieden: 'statusDivorced', verwitwet: 'statusWidowed', partner: 'statusPartner' };
  const kind = detail.kind === 'marriage' ? t.get('familyMarriage') : detail.kind === 'partnership' ? t.get('statusPartner') : '';
  const status = detail.status && detail.status !== 'unknown' ? statuses[detail.status] ? t.get(statuses[detail.status]) : detail.status : '';
  const dates = [detail.start ? t.get('familySince', { date: detail.start }) : '', detail.end ? t.get('familyUntil', { date: detail.end }) : ''].filter(Boolean).join(' · ');
  return [...new Set([kind, status, dates].filter(Boolean))].join(' · ');
}

export function siblingDescription(dataset, person, sibling, shared, t) {
  const bio = (id) => (dataset.people[id].parents || []).filter(parent => parentType(dataset.people, parent, id) === 'biological');
  const a = bio(person), b = bio(sibling), common = a.filter(parent => b.includes(parent));
  if (a.length === 2 && b.length === 2 && common.length === 1) return t.get('familyHalfSibling');
  return shared.length ? t.get('familySharedParents', { names: shared.map(parent => dataset.people[parent].name || parent).join(', ') }) : '';
}
