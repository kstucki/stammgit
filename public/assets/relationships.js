// Shared, DOM-free relationship semantics. Missing annotations remain absent.
export const PARENT_TYPES = ["biological", "adoptive", "guardian", "other", "unknown"];
export const PARTNER_KINDS = ["marriage", "partnership", "unknown"];
const unique = values => [...new Set(values)];

export function parentGroups(person) {
  const parents = unique(person?.parents || []).sort();
  if (person?.parentGroups) return person.parentGroups.map(group => [...group].sort());
  return parents.length > 2 ? parents.map(parent => [parent]) : parents.length ? [parents] : [];
}

export function parentType(people, parent, child) {
  return people[child]?.parentDetails?.[parent]?.type || "unknown";
}

// Kind and dates describe the pair; status remains specific to the owner.
// A widowed status is never copied to the other person.
export function partnerDetail(people, owner, other) {
  const own = people[owner]?.partnerDetails?.[other] || {};
  const reverse = people[other]?.partnerDetails?.[owner] || {};
  return { ...own, ...Object.fromEntries(["kind", "start", "end"].flatMap(key =>
    own[key] && own[key] !== "unknown" ? [[key, own[key]]] : reverse[key] !== undefined ? [[key, reverse[key]]] : [])) };
}

// Comparable, non-overlapping ISO date intervals only. Free text is preserved
// but is never interpreted as a date or used to claim a chronological order.
export function dateRange(value) {
  if (typeof value !== "string" || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (month !== undefined && (month < 1 || month > 12)) return null;
  const days = month === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28)
    : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (day !== undefined && (day < 1 || day > days)) return null;
  return [year * 10000 + (month || 1) * 100 + (day || 1), year * 10000 + (month || 12) * 100 + (day || (month ? days : 31))];
}

export function orderedPartners(people, id) {
  const ids = unique(people[id]?.partners || []).sort();
  // Topological order preserves known "earlier than" constraints; stable IDs
  // resolve unrelated or incomparable dates without inventing chronology.
  const ranges = new Map(ids.map(other => [other, dateRange(partnerDetail(people, id, other).start)]));
  const remaining = new Set(ids), result = [];
  while (remaining.size) {
    const ready = [...remaining].find(other => ![...remaining].some(before => {
      const a = ranges.get(before), b = ranges.get(other);
      return before !== other && a && b && a[1] < b[0];
    }));
    result.push(ready); remaining.delete(ready);
  }
  return result;
}

export function personSources(person) {
  return [...(person?.sources || []), ...Object.values(person?.parentDetails || {}).flatMap(detail => detail.sources || [])];
}

export function hasRelationshipMetadata(person) {
  return !!(person?.parentDetails || person?.parentGroups
    || Object.values(person?.partnerDetails || {}).some(detail => ["kind", "start", "end"].some(key => detail[key] !== undefined)));
}

export function setParentDetail(data, child, parent, changes) {
  const person = data.people[child];
  if (!person?.parents?.includes(parent)) throw new Error("Parent relationship is not recorded.");
  person.parentDetails ||= {};
  const detail = { ...(person.parentDetails[parent] || {}), ...changes };
  for (const key of Object.keys(detail)) if (detail[key] === "" || detail[key] === undefined) delete detail[key];
  if (Object.keys(detail).length) person.parentDetails[parent] = detail;
  else delete person.parentDetails[parent];
  if (!Object.keys(person.parentDetails).length) delete person.parentDetails;
}

export function setParentGroup(data, child, parent, join = "") {
  const person = data.people[child];
  if (!person?.parents?.includes(parent) || (join && (join === parent || !person.parents.includes(join)))) throw new Error("Invalid parent group member.");
  const groups = parentGroups(person).map(group => group.filter(id => id !== parent)).filter(group => group.length);
  const target = join && groups.find(group => group.includes(join));
  if (target) target.push(parent); else groups.push([parent]);
  person.parentGroups = groups.map(group => group.sort()).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export function linkRecordedRelation(data, type, aId, bId) {
  const a = data.people[aId], b = data.people[bId];
  if (!a || !b || aId === bId || !["parents", "children", "partners"].includes(type)) throw new Error("Invalid relationship.");
  const child = type === "parents" ? a : type === "children" ? b : null;
  const parent = type === "parents" ? bId : aId;
  if (child?.parentGroups && !child.parents?.includes(parent)) child.parentGroups.push([parent]);
  a[type] = unique([...(a[type] || []), bId]);
  const reverse = { parents: "children", children: "parents", partners: "partners" }[type];
  b[reverse] = unique([...(b[reverse] || []), aId]);
}

export function setPartnerDetail(data, owner, other, changes) {
  if (!data.people[owner]?.partners?.includes(other)) throw new Error("Partnership is not recorded.");
  const update = (a, b, values) => {
    const person = data.people[a];
    person.partnerDetails ||= {};
    const detail = { ...(person.partnerDetails[b] || {}), ...values };
    for (const key of Object.keys(detail)) if (detail[key] === "" || detail[key] === undefined) delete detail[key];
    if (Object.keys(detail).length) person.partnerDetails[b] = detail;
    else delete person.partnerDetails[b];
    if (!Object.keys(person.partnerDetails).length) delete person.partnerDetails;
  };
  update(owner, other, changes);
  const shared = Object.fromEntries(Object.entries(changes).filter(([key]) => ["kind", "start", "end"].includes(key)));
  if (Object.keys(shared).length) update(other, owner, shared);
}
