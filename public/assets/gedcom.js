// GEDCOM 5.5.1 Export/Import für das interne Stammbaum-Schema.

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
  return v; // Jahreszahlen oder Freitext unverändert
}

export function exportGedcom(data) {
  const people = data?.people || {};
  const ids = Object.keys(people);
  const xref = {};
  ids.forEach((id, i) => { xref[id] = `@I${i + 1}@`; });

  // Familien aus Partnerpaaren und Eltern von Kindern ableiten
  const famKey = (a, b) => [a, b].filter(Boolean).sort().join("|");
  const fams = new Map(); // key -> {partners:[a,b], children:[]}
  for (const [id, p] of Object.entries(people)) {
    for (const partner of p.partners || []) {
      const key = famKey(id, partner);
      if (!fams.has(key)) fams.set(key, { partners: [id, partner].sort(), children: [] });
    }
  }
  for (const [id, p] of Object.entries(people)) {
    const parents = (p.parents || []).filter((x) => people[x]);
    if (!parents.length) continue;
    const key = famKey(parents[0], parents[1]);
    if (!fams.has(key)) fams.set(key, { partners: [...parents].sort(), children: [] });
    fams.get(key).children.push(id);
  }
  const famList = [...fams.values()];
  const famXref = new Map();
  famList.forEach((f, i) => famXref.set(f, `@F${i + 1}@`));

  const famsOfPerson = (id) => famList.filter((f) => f.partners.includes(id));
  const famOfChild = (id) => famList.find((f) => f.children.includes(id));

  const lines = [
    "0 HEAD",
    "1 SOUR familienstammbaum",
    "1 GEDC",
    "2 VERS 5.5.1",
    "2 FORM LINEAGE-LINKED",
    "1 CHAR UTF-8"
  ];

  for (const id of ids) {
    const p = people[id];
    const { given, surname } = splitName(p.name);
    lines.push(`0 ${xref[id]} INDI`);
    lines.push(`1 NAME ${given} /${surname}/`);
    if (p.gender === "m" || p.gender === "f") lines.push(`1 SEX ${p.gender.toUpperCase()}`);
    if (p.birth) { lines.push("1 BIRT"); lines.push(`2 DATE ${gedcomDate(p.birth)}`); }
    if (p.death) { lines.push("1 DEAT"); lines.push(`2 DATE ${gedcomDate(p.death)}`); }
    if (p.occupation) lines.push(`1 OCCU ${p.occupation}`);
    for (const n of p.notes || []) lines.push(`1 NOTE ${n}`);
    for (const s of p.sources || []) lines.push(`1 NOTE Quelle: ${s.label}${s.url ? ` – ${s.url}` : ""}`);
    const childFam = famOfChild(id);
    if (childFam) lines.push(`1 FAMC ${famXref.get(childFam)}`);
    for (const f of famsOfPerson(id)) lines.push(`1 FAMS ${famXref.get(f)}`);
  }

  for (const f of famList) {
    const [a, b] = f.partners;
    lines.push(`0 ${famXref.get(f)} FAM`);
    if (a && people[a]) lines.push(`1 HUSB ${xref[a]}`);
    if (b && people[b]) lines.push(`1 WIFE ${xref[b]}`);
    for (const c of f.children) lines.push(`1 CHIL ${xref[c]}`);
    const status = people[a]?.partnerDetails?.[b]?.status || people[b]?.partnerDetails?.[a]?.status;
    if (a && b) {
      if (status !== "partner") lines.push("1 MARR");
      if (status === "geschieden") lines.push("1 DIV Y");
    }
  }

  lines.push("0 TRLR");
  return lines.join("\n") + "\n";
}

export function importGedcom(text) {
  const records = [];
  let current = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const m = raw.match(/^(\d+)\s+(@[^@]+@\s+)?(\S+)(?:\s(.*))?$/);
    if (!m) continue;
    const [, levelStr, xrefRaw, tag, value = ""] = m;
    const level = Number(levelStr);
    const node = { level, xref: xrefRaw?.trim(), tag, value, children: [] };
    if (level === 0) { current = node; records.push(node); }
    else if (current) {
      let parent = current;
      while (parent.children.length && parent.children[parent.children.length - 1].level < level - 1) {
        parent = parent.children[parent.children.length - 1];
      }
      // flache Suche nach dem richtigen Elternknoten
      let stack = current;
      const path = [current];
      while (true) {
        const last = path[path.length - 1];
        const lastChild = last.children[last.children.length - 1];
        if (lastChild && lastChild.level < level) path.push(lastChild);
        else break;
      }
      path[path.length - 1].children.push(node);
    }
  }

  const find = (node, tag) => node.children.find((c) => c.tag === tag);
  const findAll = (node, tag) => node.children.filter((c) => c.tag === tag);

  const people = {};
  const byXref = {};
  const slug = (name) => {
    let base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "person";
    let id = base, n = 2;
    while (people[id]) id = `${base}_${n++}`;
    return id;
  };

  for (const rec of records.filter((r) => r.tag === "INDI")) {
    const nameNode = find(rec, "NAME");
    const name = (nameNode?.value || "Unbekannt").replace(/\//g, "").replace(/\s+/g, " ").trim();
    const id = slug(name);
    const p = { name };
    const birt = find(rec, "BIRT"); const deat = find(rec, "DEAT");
    const bdate = birt && find(birt, "DATE")?.value; if (bdate) p.birth = bdate;
    const ddate = deat && find(deat, "DATE")?.value; if (ddate) p.death = ddate;
    const occu = find(rec, "OCCU")?.value; if (occu) p.occupation = occu;
    const sex = find(rec, "SEX")?.value; if (sex === "M") p.gender = "m"; if (sex === "F") p.gender = "f";
    const notes = findAll(rec, "NOTE").map((n) => n.value).filter(Boolean);
    if (notes.length) p.notes = notes;
    people[id] = p;
    byXref[rec.xref] = id;
  }

  const addUnique = (obj, key, value) => {
    obj[key] = [...new Set([...(obj[key] || []), value])];
  };

  for (const rec of records.filter((r) => r.tag === "FAM")) {
    const husb = byXref[find(rec, "HUSB")?.value];
    const wife = byXref[find(rec, "WIFE")?.value];
    const children = findAll(rec, "CHIL").map((c) => byXref[c.value]).filter(Boolean);
    if (husb && wife) { addUnique(people[husb], "partners", wife); addUnique(people[wife], "partners", husb); }
    const divorced = !!find(rec, "DIV");
    const married = !!find(rec, "MARR");
    if (husb && wife && (divorced || !married)) {
      const status = divorced ? "geschieden" : "partner";
      people[husb].partnerDetails = { ...(people[husb].partnerDetails || {}), [wife]: { status } };
      people[wife].partnerDetails = { ...(people[wife].partnerDetails || {}), [husb]: { status } };
    }
    for (const c of children) {
      for (const parent of [husb, wife].filter(Boolean)) {
        addUnique(people[c], "parents", parent);
        addUnique(people[parent], "children", c);
      }
    }
  }

  const first = Object.keys(people)[0];
  return {
    meta: { title: "Familienstammbaum (GEDCOM-Import)", focusPersonId: first, defaultAncestorDepth: 3 },
    people
  };
}
