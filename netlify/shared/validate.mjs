// Dataset integrity rules, as a pure function over the parsed data.
// One source of truth for three callers: the build test suite, the GitHub
// sync function and the local server. A sync that skipped these checks could
// commit a broken YAML that fails the next build and freezes every deploy.
// Checks that need the file system (photo files, source documents) stay in
// scripts/test.mjs — the sync only ever sees the submitted object.

const REL_KEYS = ["parents", "children", "partners"];
const PHOTO_RE = /^\/photos\/[a-zA-Z0-9._-]+\.(?:png|jpe?g)$/;

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
    for (const par of p.parents || []) {
      if (known.has(par) && !(people[par]?.children || []).includes(pid)) {
        fail(`'${par}' does not list '${pid}' as child.`);
      }
    }
    for (const child of p.children || []) {
      if (known.has(child) && !(people[child]?.parents || []).includes(pid)) {
        fail(`'${child}' does not list '${pid}' as parent.`);
      }
    }
    for (const partner of p.partners || []) {
      if (known.has(partner) && !(people[partner]?.partners || []).includes(pid)) {
        fail(`partner link '${pid}' <-> '${partner}' not symmetric.`);
      }
    }

    if (p.notes !== undefined &&
        !(Array.isArray(p.notes) && p.notes.every((n) => typeof n === "string"))) {
      fail(`'${pid}'.notes must be a list of strings.`);
    }
    if (p.sources !== undefined &&
        !(Array.isArray(p.sources) && p.sources.every((x) =>
          x && typeof x === "object" && typeof x.url === "string" &&
          (x.label === undefined || typeof x.label === "string")))) {
      fail(`'${pid}'.sources must be a list of { label, url }.`);
    }
    if (p.photo !== undefined && !PHOTO_RE.test(String(p.photo))) {
      fail(`'${pid}'.photo must be /photos/<file>.jpg|png, got '${p.photo}'.`);
    }
    if (p.partnerDetails !== undefined &&
        (typeof p.partnerDetails !== "object" || Array.isArray(p.partnerDetails))) {
      fail(`'${pid}'.partnerDetails must be an object.`);
    }
  }

  return errors;
}
