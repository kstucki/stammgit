// Dataset integrity rules, as a pure function over the parsed data.
// One source of truth for three callers: the build test suite, the GitHub
// sync function and the local server. A sync that skipped these checks could
// commit a broken YAML that fails the next build and freezes every deploy.
// Checks that need the file system (photo files, source documents) stay in
// scripts/test.mjs — the sync only ever sees the submitted object.

// Plain relative import is also traced by the serverless function packager.
// Browser assets are served with must-revalidate headers.
import { PARENT_TYPES, PARTNER_KINDS, dateRange, partnerDetail } from "./relationships.js";

const REL_KEYS = ["parents", "children", "partners", "siblings"];
const PHOTO_RE = /^\/photos\/[a-zA-Z0-9._-]+\.(?:png|jpe?g)$/;
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const refs = value => Array.isArray(value) ? value : [];
const sources = value => Array.isArray(value) && value.every(source => object(source)
  && typeof source.url === "string" && (source.label === undefined || typeof source.label === "string"));

// Returns a list of human-readable problems; an empty list means valid.
export function validateDataset(data, { label = "dataset", maxPeople = 5000 } = {}) {
  const errors = [];
  const fail = (msg) => errors.push(`${label}: ${msg}`);

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    fail("data must be an object.");
    return errors;
  }
  const people = data.people;
  if (!people || typeof people !== "object" || Array.isArray(people)) {
    fail("'people' must be an object.");
    return errors;
  }

  const ids = Object.keys(people);
  if (!ids.length) fail("no persons.");
  if (ids.length > maxPeople) fail(`implausible number of persons (${ids.length} > ${maxPeople}).`);

  const known = new Set(ids);
  const focus = data.meta?.focusPersonId;
  if (!focus || !known.has(focus)) fail(`focusPersonId missing or unknown ('${focus ?? ""}').`);

  for (const [pid, p] of Object.entries(people)) {
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      fail(`'${pid}' must be an object.`);
      continue;
    }
    if (p.name !== undefined && typeof p.name !== "string") {
      fail(`'${pid}'.name must be a string.`);
    }

    if (p.gender !== undefined && !["m", "f", "d"].includes(p.gender)) {
      fail(`'${pid}'.gender must be m, f or d (or omitted when unknown).`);
    }

    for (const rel of REL_KEYS) {
      if (p[rel] === undefined) continue;
      if (!Array.isArray(p[rel]) || p[rel].some((x) => typeof x !== "string")) {
        fail(`'${pid}'.${rel} must be a list of person ids.`);
        continue;
      }
      for (const other of p[rel]) {
        if (!known.has(other)) fail(`'${pid}'.${rel} -> unknown id '${other}'.`);
      }
      if (p[rel].includes(pid)) fail(`'${pid}'.${rel} refers to itself.`);
    }

    // Relationships are stored on both sides; a one-sided link would make the
    // graph depend on which person the layout happens to visit first.
    for (const par of refs(p.parents)) {
      if (known.has(par) && !refs(people[par]?.children).includes(pid)) {
        fail(`'${par}' does not list '${pid}' as child.`);
      }
    }
    for (const child of refs(p.children)) {
      if (known.has(child) && !refs(people[child]?.parents).includes(pid)) {
        fail(`'${child}' does not list '${pid}' as parent.`);
      }
    }
    for (const partner of refs(p.partners)) {
      if (known.has(partner) && !refs(people[partner]?.partners).includes(pid)) {
        fail(`partner link '${pid}' <-> '${partner}' not symmetric.`);
      }
    }

    if (p.notes !== undefined &&
        !(Array.isArray(p.notes) && p.notes.every((n) => typeof n === "string"))) {
      fail(`'${pid}'.notes must be a list of strings.`);
    }
    if (p.sources !== undefined && !sources(p.sources)) {
      fail(`'${pid}'.sources must be a list of { label, url }.`);
    }
    if (p.photo !== undefined && !PHOTO_RE.test(String(p.photo))) {
      fail(`'${pid}'.photo must be /photos/<file>.jpg|png, got '${p.photo}'.`);
    }
    if (p.parentDetails !== undefined) {
      if (!object(p.parentDetails)) fail(`'${pid}'.parentDetails must be an object.`);
      else for (const [parent, detail] of Object.entries(p.parentDetails)) {
        const field = `'${pid}'.parentDetails.${parent}`;
        if (!refs(p.parents).includes(parent)) fail(`${field} must refer to a recorded parent.`);
        if (!object(detail)) { fail(`${field} must be an object.`); continue; }
        if (detail.type !== undefined && !PARENT_TYPES.includes(detail.type)) fail(`${field}: invalid type.`);
        if (detail.label !== undefined && typeof detail.label !== "string") fail(`${field}: label must be a string.`);
        if (detail.type === "other" && !(typeof detail.label === "string" && detail.label.trim())) fail(`${field}: other requires a label.`);
        if (detail.sources !== undefined && !sources(detail.sources)) fail(`${field}: sources must be a list of { label, url }.`);
      }
    }
    if (p.parentGroups !== undefined) {
      if (!Array.isArray(p.parentGroups) || p.parentGroups.some(group => !Array.isArray(group) || !group.length || group.some(id => typeof id !== "string"))) {
        fail(`'${pid}'.parentGroups must be a list of non-empty parent-id groups.`);
      } else {
        const members = p.parentGroups.flat();
        if (new Set(members).size !== members.length || members.some(id => !refs(p.parents).includes(id))
          || refs(p.parents).some(id => !members.includes(id))) {
          fail(`'${pid}'.parentGroups must contain every recorded parent exactly once.`);
        }
      }
    }
    if (p.partnerDetails !== undefined) {
      if (!object(p.partnerDetails)) fail(`'${pid}'.partnerDetails must be an object.`);
      else for (const [partner, detail] of Object.entries(p.partnerDetails)) {
        const field = `'${pid}'.partnerDetails.${partner}`;
        if (!refs(p.partners).includes(partner)) fail(`${field} must refer to a recorded partner.`);
        if (!object(detail)) { fail(`${field} must be an object.`); continue; }
        if (detail.status !== undefined && typeof detail.status !== "string") fail(`${field}: status must be a string.`);
        if (detail.kind !== undefined && !PARTNER_KINDS.includes(detail.kind)) fail(`${field}: invalid kind.`);
        for (const key of ["start", "end"]) {
          if (detail[key] !== undefined && typeof detail[key] !== "string") fail(`${field}.${key} must be a string.`);
          if (typeof detail[key] === "string" && /^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(detail[key]) && !dateRange(detail[key])) fail(`${field}.${key}: invalid date.`);
        }
        const shared = partnerDetail(people, pid, partner);
        const begin = dateRange(shared.start), end = dateRange(shared.end);
        if (begin && end && begin[0] > end[1]) fail(`${field}: end precedes start.`);
        const reverse = people[partner]?.partnerDetails?.[pid];
        if (object(reverse)) for (const key of ["kind", "start", "end"]) {
          const a = detail[key], b = reverse[key];
          if (a && b && a !== "unknown" && b !== "unknown" && a !== b) fail(`${field}.${key} conflicts with reverse entry.`);
        }
      }
    }
  }

  return errors;
}
