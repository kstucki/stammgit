// Pure data operations – shared by the app and the tests.

export function removePersonFromData(data, id) {
  const people = data.people;
  if (!people[id]) return { ok: false, reason: "not_found" };
  if (data.meta?.focusPersonId === id) return { ok: false, reason: "focus" };
  delete people[id];
  for (const p of Object.values(people)) {
    for (const key of ["parents", "children", "partners"]) {
      if (!p[key]) continue;
      p[key] = p[key].filter((x) => x !== id);
      if (!p[key].length) delete p[key];
    }
    if (p.partnerDetails && p.partnerDetails[id]) {
      delete p.partnerDetails[id];
      if (!Object.keys(p.partnerDetails).length) delete p.partnerDetails;
    }
  }
  if (Array.isArray(data.meta?.autoExpand)) {
    data.meta.autoExpand = data.meta.autoExpand.filter((x) => x !== id);
  }
  return { ok: true };
}

export function countSourceLinks(people, url) {
  let n = 0;
  for (const p of Object.values(people)) {
    if ((p.sources || []).some((s) => s.url === url)) n++;
  }
  return n;
}

export function removeSourceLinks(people, url) {
  let removed = 0;
  for (const p of Object.values(people)) {
    if (!p.sources) continue;
    const before = p.sources.length;
    p.sources = p.sources.filter((s) => s.url !== url);
    removed += before - p.sources.length;
    if (!p.sources.length) delete p.sources;
  }
  return removed;
}

// Merge a GEDCOM import additively into existing data: collision-safe IDs,
// no automatic merging – only a duplicate warning list.
export function mergeImportedPeople(data, importedPeople) {
  const people = data.people;
  const idMap = new Map();
  for (const oldId of Object.keys(importedPeople)) {
    let id = oldId, n = 2;
    while (people[id] || idMap.has(id)) id = `${oldId}_import${n > 2 ? n : ""}`, n++;
    idMap.set(oldId, id);
  }
  const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const year = (s) => (String(s || "").match(/\d{4}/) || [""])[0];
  const existingKeys = new Map();
  for (const [id, p] of Object.entries(people)) {
    existingKeys.set(`${norm(p.name)}|${year(p.birth)}`, id);
  }
  const duplicates = [];
  for (const [oldId, p] of Object.entries(importedPeople)) {
    const id = idMap.get(oldId);
    const q = structuredClone(p);
    const newIds = new Set(idMap.values());
    for (const key of ["parents", "children", "partners"]) {
      if (!q[key]) continue;
      q[key] = q[key].map((x) => idMap.get(x) || x).filter((x) => newIds.has(x) || people[x]);
      if (!q[key].length) delete q[key];
    }
    if (q.partnerDetails) {
      q.partnerDetails = Object.fromEntries(Object.entries(q.partnerDetails).map(([k, v]) => [idMap.get(k) || k, v]));
    }
    people[id] = q;
    const hit = existingKeys.get(`${norm(p.name)}|${year(p.birth)}`);
    if (hit) duplicates.push({ importedId: id, existingId: hit, name: p.name });
  }
  return { added: idMap.size, idMap, duplicates };
}

// Absorb a duplicate: dropId is dissolved into keepId.
// Relationships, sources and notes are united, all references from
// other persons to dropId are rewritten, then dropId is deleted.
export function absorbPerson(data, keepId, dropId) {
  const people = data.people;
  if (keepId === dropId) return { ok: false, reason: "same" };
  const keep = people[keepId], drop = people[dropId];
  if (!keep || !drop) return { ok: false, reason: "not_found" };
  // Absorbing the focus person transfers the focus to the kept person –
  // important for the create-dataset-then-import workflow, where the seed
  // person is merged into the imported "real" one.
  if (data.meta?.focusPersonId === dropId) data.meta.focusPersonId = keepId;

  const union = (a = [], b = []) => [...new Set([...a, ...b])].filter((x) => x !== keepId && x !== dropId);
  for (const key of ["parents", "children", "partners"]) {
    const merged = union(keep[key], drop[key]);
    if (merged.length) keep[key] = merged; else delete keep[key];
  }
  const srcUnion = [...(keep.sources || []), ...(drop.sources || [])];
  const seen = new Set();
  const sources = srcUnion.filter((s) => !seen.has(s.url) && seen.add(s.url));
  if (sources.length) keep.sources = sources;
  const notes = [...new Set([...(keep.notes || []), ...(drop.notes || [])])];
  if (notes.length) keep.notes = notes;
  for (const key of ["birth", "death", "occupation"]) {
    if (!keep[key] && drop[key]) keep[key] = drop[key];
  }
  if (drop.partnerDetails) {
    keep.partnerDetails = { ...(drop.partnerDetails || {}), ...(keep.partnerDetails || {}) };
    delete keep.partnerDetails[keepId]; delete keep.partnerDetails[dropId];
    if (!Object.keys(keep.partnerDetails).length) delete keep.partnerDetails;
  }

  delete people[dropId];
  for (const p of Object.values(people)) {
    for (const key of ["parents", "children", "partners"]) {
      if (!p[key]) continue;
      p[key] = [...new Set(p[key].map((x) => (x === dropId ? keepId : x)))];
      if (!p[key].length) delete p[key];
    }
    if (p.partnerDetails && p.partnerDetails[dropId]) {
      if (!p.partnerDetails[keepId]) p.partnerDetails[keepId] = p.partnerDetails[dropId];
      delete p.partnerDetails[dropId];
    }
  }
  if (Array.isArray(data.meta?.autoExpand)) {
    data.meta.autoExpand = [...new Set(data.meta.autoExpand.map((x) => (x === dropId ? keepId : x)))];
  }
  return { ok: true };
}
