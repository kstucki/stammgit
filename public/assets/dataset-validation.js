// Dataset integrity rules, as a pure function over the parsed data.
// One source of truth for three callers: the build test suite, the GitHub
// sync function and the local server. A sync that skipped these checks could
// commit a broken YAML that fails the next build and freezes every deploy.
// Checks that need the file system (photo files, source documents) stay in
// scripts/test.mjs — the sync only ever sees the submitted object.

// Plain relative import is also traced by the serverless function packager.
// Browser assets are served with must-revalidate headers.
import { PARENT_TYPES, PARTNER_KINDS, dateRange, partnerDetail } from "./relationships.js";
import { SOURCE_CATEGORIES } from "./source-categories.js";
import { isValidDate } from "./date-grammar.js";
import { isWebUrl, validWebLinks } from "./web-links.js";

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

    if (p.displayName !== undefined && typeof p.displayName !== "string") {
      fail(`'${pid}'.displayName must be a string.`);
    }

    if (p.gender !== undefined && !["m", "f", "d"].includes(p.gender)) {
      fail(`'${pid}'.gender must be m, f or d (or omitted when unknown).`);
    }

    if (p.evidenceStatus !== undefined && !["unsicher", "gut", "gesichert"].includes(p.evidenceStatus)) {
      fail(`'${pid}'.evidenceStatus must be unsicher, gut or gesichert (or omitted when unassessed).`);
    }

    for (const field of ["birth", "death"]) {
      if (p[field] !== undefined && !isValidDate(p[field])) {
        fail(`'${pid}'.${field}: unknown date «${p[field]}»; allowed: YYYY, YYYY-MM, YYYY-MM-DD, «um/vor/nach YYYY», «YYYY od. YYYY», «YYYY ?».`);
      }
    }
    if (p.birthSurname !== undefined && (typeof p.birthSurname !== "string" || !p.birthSurname.trim())) {
      fail(`'${pid}'.birthSurname must be a non-empty string (or omitted when unknown).`);
    }
    if (p.living !== undefined && typeof p.living !== "boolean") fail(`'${pid}'.living must be true or false.`);

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

    for (const key of ["occupation", "occupation_pt", "occupation_en", "birthPlace", "deathPlace"]) {
      if (p[key] !== undefined && typeof p[key] !== "string") fail(`'${pid}'.${key} must be a string.`);
    }
    for (const key of ["notes", "notes_pt", "notes_en"]) {
      if (p[key] !== undefined && !(Array.isArray(p[key]) && p[key].every(n => typeof n === "string"))) {
        fail(`'${pid}'.${key} must be a list of strings.`);
      }
    }
    if (p.sources !== undefined && !sources(p.sources)) {
      fail(`'${pid}'.sources must be a list of { label, url }.`);
    }
    if (p.links !== undefined && !validWebLinks(p.links)) {
      fail(`'${pid}'.links must be a list of { label?, url } with absolute HTTP(S) URLs.`);
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
          if (typeof detail[key] === "string" && !isValidDate(detail[key])) fail(`${field}.${key}: invalid date «${detail[key]}».`);
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

  if (data.sourceCategories !== undefined) {
    if (!object(data.sourceCategories)) fail("'sourceCategories' must be an object.");
    else for (const [url, category] of Object.entries(data.sourceCategories)) {
      if (!SOURCE_CATEGORIES.includes(category)) fail(`sourceCategories['${url}'] must be one of ${SOURCE_CATEGORIES.join(", ")}.`);
    }
  }

  if (data.sourceDetails !== undefined) {
    if (!object(data.sourceDetails)) fail("'sourceDetails' must be an object.");
    else {
      const ids = new Set();
      for (const [url, detail] of Object.entries(data.sourceDetails)) {
        const label = `sourceDetails['${url}']`;
        if (!/^\/sources\/[a-zA-Z0-9._-]+\.(pdf|png|jpe?g)$/.test(url) && !isWebUrl(url)) fail(`${label}: invalid document URL.`);
        if (!object(detail)) { fail(`${label} must be an object.`); continue; }
        if (typeof detail.title !== 'string' || !detail.title.trim()) fail(`${label}.title must be a nonempty string.`);
        for (const key of ['citation', 'original', 'archive', 'retrieved', 'kind', 'scope']) {
          if (detail[key] !== undefined && typeof detail[key] !== 'string') fail(`${label}.${key} must be a string.`);
        }
        if (detail.id !== undefined) {
          if (typeof detail.id !== 'string' || !/^B\d{6}$/.test(detail.id) || ids.has(detail.id)) fail(`${label}.id must be a unique B identifier with six digits.`);
          ids.add(detail.id);
        }
        if (detail.tags !== undefined && (!Array.isArray(detail.tags) || detail.tags.some(tag => typeof tag !== 'string' || !tag.trim()) || new Set(detail.tags).size !== detail.tags.length)) fail(`${label}.tags must be unique nonempty strings.`);
      }
    }
  }

  return errors;
}

// Build hint for legacy German dates (DD.MM.YYYY); validation rejects them, the editor and GEDCOM import normalize them.
export function dateWarnings(dataset) {
  const warnings = [];
  for (const [id, person] of Object.entries(dataset.people || {})) {
    for (const field of ['birth', 'death']) {
      if (/^\d{2}\.\d{2}\.\d{4}$/.test(String(person[field] || ''))) {
        warnings.push(`${id}.${field}: DD.MM.YYYY; ISO YYYY-MM-DD bevorzugen (${person[field]}).`);
      }
    }
  }
  return warnings;
}
