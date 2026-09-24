import { parentGroups, parentType, partnerDetail } from "./relationships.js";

// GEDCOM 5.5.1 export/import for the internal family tree schema.

const PARTICLES = new Set(["von", "van", "de", "da", "di", "du", "della", "v."]);

function splitName(full = "") {
  const parts = String(full).trim().split(/\s+/);
  if (parts.length < 2) return { given: full, surname: "" };
  let idx = parts.length - 1;
  for (let i = 1; i < parts.length - 1; i++) {
    if (PARTICLES.has(parts[i].toLowerCase())) { idx = i; break; }
  }
  return { given: parts.slice(0, idx).join(" "), surname: parts.slice(idx).join(" ") };
}

function gedcomDate(value = "") {
  const v = String(value).trim();
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    return `${Number(iso[3])} ${months[Number(iso[2]) - 1]} ${iso[1]}`;
  }
  return v; // years or free text unchanged
}

// Private underscore extensions preserve exact relationship annotations on our
// roundtrip. Standard FAMC/PEDI/ADOP links remain available to other readers.
const REL_FIELDS = ["parents", "children", "partners", "siblings", "parentDetails", "parentGroups", "partnerDetails"];
function mapRelationships(person, map) {
  const result = {};
  for (const key of REL_FIELDS) {
    if (person[key] === undefined) continue;
    if (["parentDetails", "partnerDetails"].includes(key)) {
      result[key] = Object.fromEntries(Object.entries(person[key]).map(([id, detail]) => [map(id), structuredClone(detail)]));
    } else if (key === "parentGroups") result[key] = person[key].map(group => group.map(map));
    else result[key] = person[key].map(map);
  }
  return result;
}
function writeExtension(lines, tag, value) {
  const chars = Array.from(JSON.stringify(value));
  lines.push(`1 ${tag} ${chars.splice(0, 40).join("")}`);
  while (chars.length) lines.push(`2 CONC ${chars.splice(0, 40).join("")}`);
}

export function exportGedcom(data) {
  const people = data?.people || {}, ids = Object.keys(people);
  const xref = new Map(ids.map((id, i) => [id, `@I${i + 1}@`]));
  const pointer = id => { if (!xref.has(id)) throw new Error(`Unknown person: ${id}`); return xref.get(id); };
  const families = new Map();
  const family = adults => {
    const sorted = [...adults].sort(), key = JSON.stringify(sorted);
    if (!families.has(key)) families.set(key, { adults: sorted, children: [], partnership: false });
    return families.get(key);
  };
  for (const [id, person] of Object.entries(people)) {
    for (const other of person.partners || []) family([id, other]).partnership = true;
    for (const group of parentGroups(person)) {
      // GEDCOM 5.5.1 has two adult slots. Preserve larger groups exactly in the
      // extension and expose every parent via individual standard FAMC links.
      for (const adults of group.length > 2 ? group.map(parent => [parent]) : [group]) family(adults).children.push(id);
    }
  }
  const fams = [...families.values()];
  fams.forEach((fam, i) => { fam.xref = `@F${i + 1}@`; });
  const lines = ["0 HEAD", "1 SOUR familienstammbaum", "1 GEDC", "2 VERS 5.5.1", "2 FORM LINEAGE-LINKED", "1 CHAR UTF-8"];
  for (const id of ids) {
    const p = people[id], { given, surname } = splitName(p.name);
    lines.push(`0 ${pointer(id)} INDI`, `1 NAME ${given} /${surname}/`);
    if (["m", "f"].includes(p.gender)) lines.push(`1 SEX ${p.gender.toUpperCase()}`);
    if (p.birth) lines.push("1 BIRT", `2 DATE ${gedcomDate(p.birth)}`);
    if (p.death) lines.push("1 DEAT", `2 DATE ${gedcomDate(p.death)}`);
    if (p.occupation) lines.push(`1 OCCU ${p.occupation}`);
    for (const note of p.notes || []) lines.push(`1 NOTE ${note}`);
    for (const source of p.sources || []) lines.push(`1 NOTE Quelle: ${source.label || ""}${source.url ? ` – ${source.url}` : ""}`);
    for (const fam of fams.filter(fam => fam.children.includes(id))) {
      lines.push(`1 FAMC ${fam.xref}`);
      if (fam.adults.every(parent => parentType(people, parent, id) === "biological")) lines.push("2 PEDI birth");
      const adoptive = fam.adults.filter(parent => parentType(people, parent, id) === "adoptive");
      if (adoptive.length) {
        if (adoptive.length === fam.adults.length) lines.push("2 PEDI adopted");
        const selector = adoptive.length === 2 ? "BOTH" : adoptive[0] === fam.adults[0] ? "HUSB" : "WIFE";
        lines.push("1 ADOP", `2 FAMC ${fam.xref}`, `3 ADOP ${selector}`);
      }
    }
    for (const fam of fams.filter(fam => fam.adults.includes(id))) lines.push(`1 FAMS ${fam.xref}`);
    writeExtension(lines, "_STAMMBAUM_ID", id);
    writeExtension(lines, "_STAMMBAUM_REL", { version: 1, ...mapRelationships(p, pointer) });
  }
  for (const fam of fams) {
    const [a, b] = fam.adults;
    lines.push(`0 ${fam.xref} FAM`, `1 HUSB ${pointer(a)}`);
    if (b) lines.push(`1 WIFE ${pointer(b)}`);
    for (const child of fam.children) lines.push(`1 CHIL ${pointer(child)}`);
    if (fam.partnership) {
      const own = partnerDetail(people, a, b), reverse = partnerDetail(people, b, a);
      const married = own.kind === "marriage" || [own.status, reverse.status].some(status => ["verheiratet", "geschieden", "verwitwet"].includes(status));
      if (married) {
        lines.push("1 MARR");
        if (own.start) lines.push(`2 DATE ${gedcomDate(own.start)}`);
      }
      if ([own.status, reverse.status].includes("geschieden")) {
        lines.push("1 DIV Y");
        if (own.end) lines.push(`2 DATE ${gedcomDate(own.end)}`);
      }
    }
  }
  lines.push("0 TRLR");
  return lines.join("\n") + "\n";
}

export function importGedcom(text) {
  const records = [], stack = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const match = raw.match(/^(\d+)\s+(@[^@]+@\s+)?(\S+)(?:\s(.*))?$/);
    if (!match) continue;
    const [, levelText, xref, tag, value = ""] = match;
    const node = { level: Number(levelText), xref: xref?.trim(), tag, value, children: [] };
    while (stack.length && stack.at(-1).level >= node.level) stack.pop();
    if (!node.level) records.push(node);
    else if (stack.length) stack.at(-1).children.push(node);
    stack.push(node);
  }
  const all = (node, tag) => (node?.children || []).filter(child => child.tag === tag);
  const find = (node, tag) => all(node, tag)[0];
  const textOf = node => node ? node.value + node.children.filter(child => ["CONC", "CONT"].includes(child.tag)).map(child => (child.tag === "CONT" ? "\n" : "") + child.value).join("") : "";
  const extension = (node, tag) => { const field = find(node, tag); return field ? JSON.parse(textOf(field)) : undefined; };
  const people = Object.create(null), byXref = new Map(), nodes = new Map(), packed = new Map();
  const individuals = records.filter(record => record.tag === "INDI");
  for (const record of individuals) {
    const name = (textOf(find(record, "NAME")) || "Unbekannt").replace(/\//g, "").replace(/\s+/g, " ").trim();
    const originalId = extension(record, "_STAMMBAUM_ID");
    const base = typeof originalId === "string" && originalId ? originalId : name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "person";
    let id = base, n = 2;
    while (Object.hasOwn(people, id)) id = `${base}_${n++}`;
    const p = { name };
    for (const [field, event] of [["birth", "BIRT"], ["death", "DEAT"]]) {
      const date = find(find(record, event), "DATE")?.value;
      if (date) p[field] = date;
    }
    const occupation = textOf(find(record, "OCCU")); if (occupation) p.occupation = occupation;
    const sex = find(record, "SEX")?.value; if (["M", "F"].includes(sex)) p.gender = sex.toLowerCase();
    const notes = all(record, "NOTE").map(textOf).filter(Boolean); if (notes.length) p.notes = notes;
    people[id] = p; byXref.set(record.xref, id); nodes.set(id, record);
    const detail = extension(record, "_STAMMBAUM_REL");
    if (detail !== undefined) {
      if (!detail || typeof detail !== "object" || detail.version !== 1) throw new Error("Unsupported _STAMMBAUM_REL data.");
      packed.set(id, detail);
    }
  }
  const ref = pointer => { const id = byXref.get(pointer); if (!id) throw new Error(`Unknown GEDCOM person ${pointer}.`); return id; };
  const add = (person, key, value) => { person[key] = [...new Set([...(person[key] || []), value])]; };
  const groups = new Map();
  const setType = (child, parent, type, label) => {
    people[child].parentDetails ||= {};
    const previous = people[child].parentDetails[parent];
    if (previous?.type && previous.type !== type) throw new Error(`Conflicting parent types for ${child}/${parent}.`);
    people[child].parentDetails[parent] = { type, ...(label ? { label } : {}) };
  };
  for (const fam of records.filter(record => record.tag === "FAM")) {
    const husband = find(fam, "HUSB"), wife = find(fam, "WIFE");
    const adults = [husband, wife].filter(Boolean).map(node => ref(node.value));
    if (!adults.length) continue;
    if (all(fam, "HUSB").length > 1 || all(fam, "WIFE").length > 1) throw new Error("Repeated GEDCOM adult slots are not supported.");
    const children = new Set(all(fam, "CHIL").map(node => ref(node.value)));
    for (const [id, record] of nodes) if (all(record, "FAMC").some(node => node.value === fam.xref)) children.add(id);
    const married = find(fam, "MARR"), divorced = find(fam, "DIV");
    // Two FAM adults are parents, not proof of a partnership or marriage.
    if (adults.length === 2 && (married || divorced)) {
      const [a, b] = adults;
      add(people[a], "partners", b); add(people[b], "partners", a);
      for (const [owner, other] of [[a, b], [b, a]]) {
        people[owner].partnerDetails ||= {};
        const detail = { kind: "marriage", ...(divorced ? { status: "geschieden" } : {}) };
        const start = find(married, "DATE")?.value, end = find(divorced, "DATE")?.value;
        if (start) detail.start = start; if (end) detail.end = end;
        const previous = people[owner].partnerDetails[other];
        if (previous && JSON.stringify(previous) !== JSON.stringify(detail) && !packed.has(owner)) throw new Error("Multiple partnership episodes need separate review before import.");
        people[owner].partnerDetails[other] = detail;
      }
    }
    for (const child of children) {
      for (const parent of adults) { add(people[child], "parents", parent); add(people[parent], "children", child); }
      groups.set(child, [...(groups.get(child) || []), [...adults].sort()]);
      if (packed.has(child)) continue; // Exact annotations are restored below.
      const record = nodes.get(child);
      const links = all(record, "FAMC").filter(node => node.value === fam.xref);
      const pedi = links.map(link => find(link, "PEDI")?.value?.toLowerCase()).find(Boolean);
      const adoption = all(record, "ADOP").map(event => find(event, "FAMC")).find(link => link?.value === fam.xref);
      const selector = find(adoption, "ADOP")?.value;
      if (pedi === "birth") for (const parent of adults) setType(child, parent, "biological");
      if (pedi === "foster" || pedi === "sealing") for (const parent of adults) setType(child, parent, "other", `GEDCOM: ${pedi}`);
      if (adoption || pedi === "adopted") {
        if (adults.length > 1 && !["HUSB", "WIFE", "BOTH"].includes(selector)) throw new Error(`Adoption for ${child}: the adopting parent is not specified (HUSB/WIFE/BOTH).`);
        const selected = selector === "HUSB" ? (husband ? [ref(husband.value)] : []) : selector === "WIFE" ? (wife ? [ref(wife.value)] : []) : adults;
        if (!selected.length) throw new Error(`Adoption for ${child}: selected parent is missing.`);
        for (const parent of selected) setType(child, parent, "adoptive");
      }
    }
  }
  for (const [id, families] of groups) {
    const distinct = [...new Map(families.map(group => [JSON.stringify(group), group])).values()];
    if (distinct.length > 1) {
      const flat = distinct.flat();
      if (new Set(flat).size !== flat.length && !packed.has(id)) throw new Error("Overlapping GEDCOM parent families need review before import.");
      people[id].parentGroups = distinct;
    }
  }
  for (const [id, detail] of packed) {
    const mapped = mapRelationships(detail, ref);
    for (const key of REL_FIELDS) delete people[id][key];
    Object.assign(people[id], mapped);
  }
  return { meta: { title: "GEDCOM import", focusPersonId: Object.keys(people)[0] }, people };
}
