import { personContent } from "./person-language.js";
import { parentGroups, parentType, partnerDetail } from "./relationships.js";
import { parseDate, normalizeDate, isValidDate, defaultLiving } from "./date-grammar.js";
import { validWebLinks } from "./web-links.js";
import { nameParts } from "./names.js";

// GEDCOM export and import for the internal family tree schema.
//   exportGedcom   – GEDCOM 5.5.1 for exchange: one language, no sources.
//   exportGedcom7  – FamilySearch GEDCOM 7.0 for the GEDZIP archive: sources,
//                    portraits, in one language like 5.5.1.
//   importGedcom   – reads both versions; private _STAMMBAUM_* structures
//                    restore our exact data on a roundtrip.

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const LANGUAGE_551 = { de: "German", en: "English", pt: "Portuguese" };
const LIVING_NAME = { de: "Lebende Person", en: "Living person", pt: "Pessoa viva" };
const SOURCES_NOTE = {
  de: "Ohne Quellen und Belege. Zitierte Quellen-PDFs und Porträts enthält der GEDCOM-7-Export (GEDZIP).",
  en: "Without sources and evidence. The GEDCOM 7 export (GEDZIP) includes cited source PDFs and portraits.",
  pt: "Sem fontes nem evidências. A exportação GEDCOM 7 (GEDZIP) inclui os PDFs das fontes citadas e os retratos.",
};
const PDF_PAGE = { de: "PDF-Seite", en: "PDF page", pt: "página do PDF" };
const language = value => String(value || "de").slice(0, 2).toLowerCase() === "pt" ? "pt" : String(value || "de").slice(0, 2).toLowerCase() === "en" ? "en" : "de";

// Internal date grammar (date-grammar.js) → GEDCOM date value.
export function gedcomDate(value = "") {
  const d = parseDate(String(value));
  if (!d) return String(value).trim();
  if (d.type === "exact") return [d.day, d.month ? MONTHS[d.month - 1] : null, d.year].filter(Boolean).join(" ");
  if (d.type === "about") return `ABT ${d.year}`;
  if (d.type === "before") return `BEF ${d.year}`;
  if (d.type === "after") return `AFT ${d.year}`;
  if (d.type === "either") return `BET ${d.year} AND ${d.year2}`;
  return `EST ${d.year}`; // uncertain
}

// GEDCOM date value → internal grammar; null when it cannot be represented.
export function internalDate(value = "") {
  const v = String(value).trim().toUpperCase().replace(/\s+/g, " ");
  const exact = /^(?:(\d{1,2}) )?(?:(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) )?(\d{4})$/.exec(v);
  if (exact) {
    const [, day, month, year] = exact;
    if (day && !month) return null;
    const iso = [year, month && String(MONTHS.indexOf(month) + 1).padStart(2, "0"), day && day.padStart(2, "0")].filter(Boolean).join("-");
    return isValidDate(iso) ? iso : null;
  }
  let m = /^(ABT|CAL|EST) (\d{4})$/.exec(v);
  if (m) return m[1] === "EST" ? `${m[2]} ?` : `um ${m[2]}`;
  m = /^(BEF|AFT) (\d{4})$/.exec(v);
  if (m) return `${m[1] === "BEF" ? "vor" : "nach"} ${m[2]}`;
  m = /^BET (\d{4}) AND (\d{4})$/.exec(v);
  if (m && m[1] < m[2]) return `${m[1]} od. ${m[2]}`;
  const lenient = normalizeDate(value);
  return isValidDate(lenient) ? lenient : null;
}

const today = (now = new Date()) => `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

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

// GEDCOM 5.5.1 lines are at most 255 characters. Long values continue with
// CONC, split inside a word so no reader drops a boundary space; line breaks use CONT.
const CHUNK = 200;
function splitPoint(chars) {
  let at = Math.min(CHUNK, chars.length);
  while (at > 1 && at < chars.length && (chars[at] === " " || chars[at - 1] === " ")) at--;
  at = at > 1 ? at : Math.min(CHUNK, chars.length);
  // Never cut the @@ escape pair between two CONC lines.
  let start = at; while (start > 0 && chars[start - 1] === "@") start--;
  if ((at - start) % 2) at--;
  return at;
}
function lines551(level, tag, value) {
  const result = [];
  String(value).replace(/@/g, "@@").split(/\r?\n/).forEach((line, index) => {
    const chars = Array.from(line);
    const first = chars.splice(0, chars.length > CHUNK ? splitPoint(chars) : chars.length).join("");
    result.push(`${index ? level + 1 : level} ${index ? "CONT" : tag}${first ? " " + first : ""}`);
    while (chars.length) result.push(`${level + 1} CONC ${chars.splice(0, chars.length > CHUNK ? splitPoint(chars) : chars.length).join("")}`);
  });
  return result;
}
// GEDCOM 7 has no line length limit and no CONC; only line breaks continue.
function lines7(level, tag, value) {
  return String(value).split(/\r?\n/).map(line => line.replace(/^@/, "@@")).map((line, index) => `${index ? level + 1 : level} ${index ? "CONT" : tag}${line ? " " + line : ""}`);
}
const POINTER_TAGS = new Set(["SUBM", "FAMC", "FAMS", "HUSB", "WIFE", "CHIL", "OBJE", "SOUR"]);
const isPointer = (tag, value) => POINTER_TAGS.has(tag) && /^@[^@\s]+@$/.test(String(value));
const extension = (write, level, tag, value) => write(level, tag, JSON.stringify(value));

function nameLines(write, p, isAnonymous, lang, version) {
  if (isAnonymous) return write(1, "NAME", LIVING_NAME[lang]);
  const parts = nameParts(p.name || "");
  const birth = p.birthSurname || parts.bornAs || "";
  const line = (surname, type) => {
    write(1, "NAME", `${parts.given}${surname ? ` /${surname}/` : ""}${parts.suffix ? ` ${parts.suffix}` : ""}`.trim());
    if (type) write(2, "TYPE", version === 7 ? type.toUpperCase() : type);
    if (parts.given) write(2, "GIVN", parts.given);
    if (surname) write(2, "SURN", surname);
    if (parts.suffix) write(2, "NSFX", parts.suffix);
  };
  if (birth && parts.surname && birth !== parts.surname) {
    line(birth, "birth");
    line(parts.surname, p.gender === "f" ? "married" : "aka");
  } else line(parts.surname || birth, null);
}

// Families and FAMC/FAMS links shared by both versions.
function familyIndex(people) {
  const families = new Map();
  const family = adults => {
    const sorted = [...adults].sort(), key = JSON.stringify(sorted);
    if (!families.has(key)) families.set(key, { adults: sorted, children: [], partnership: false });
    return families.get(key);
  };
  for (const [id, person] of Object.entries(people)) {
    for (const other of person.partners || []) if (people[other]) family([id, other]).partnership = true;
    for (const group of parentGroups(person)) {
      // GEDCOM has two adult slots. Preserve larger groups exactly in the
      // extension and expose every parent via individual standard FAMC links.
      for (const adults of group.length > 2 ? group.map(parent => [parent]) : [group]) family(adults).children.push(id);
    }
  }
  const fams = [...families.values()];
  fams.forEach((fam, i) => {
    fam.xref = `@F${i + 1}@`;
    // HUSB holds the man, WIFE the woman; otherwise the stable ID order.
    const [a, b] = fam.adults;
    if (!b) fam.slots = people[a]?.gender === "f" ? [null, a] : [a, null];
    else fam.slots = (people[a]?.gender === "f" && people[b]?.gender !== "f" || people[b]?.gender === "m" && people[a]?.gender !== "m") ? [b, a] : [a, b];
  });
  return fams;
}

function personBody(write, p, options) {
  const { lang, version, anonymous, version7 } = options;
  if (["m", "f"].includes(p.gender)) write(1, "SEX", p.gender.toUpperCase());
  else if (p.gender === "d") { write(1, "SEX", version === 7 ? "X" : "U"); if (version !== 7) write(1, "_GENDER", "d"); }
  if (anonymous) return;
  const deceasedWithoutData = p.living === false && !p.death && !p.deathPlace;
  for (const [field, event] of [["birth", "BIRT"], ["death", "DEAT"]]) {
    if (p[field] || p[`${field}Place`]) {
      write(1, event);
      if (p[field]) write(2, "DATE", gedcomDate(p[field]));
      if (p[`${field}Place`]) write(2, "PLAC", p[`${field}Place`]);
    } else if (event === "DEAT" && deceasedWithoutData) write(1, "DEAT", "Y");
  }
  if (version7) return version7(write, p);
  const content = personContent(p, lang);
  if (content.occupation) write(1, "OCCU", content.occupation);
  for (const note of content.notes) write(1, "NOTE", note);
}

function personExtensions(write, p, pointer, anonymous) {
  if (anonymous) return;
  if (p.displayName?.trim()) extension(write, 1, "_STAMMBAUM_DISPLAY_NAME", p.displayName);
  if (p.links?.length) extension(write, 1, "_STAMMBAUM_LINKS", p.links);
  if (p.evidenceStatus) extension(write, 1, "_STAMMBAUM_EVIDENCE", p.evidenceStatus);
  if (p.birthSurname) extension(write, 1, "_STAMMBAUM_BIRTH_SURNAME", p.birthSurname);
  if (typeof p.living === "boolean") extension(write, 1, "_STAMMBAUM_LIVING", p.living);
  if (p.locations?.length) extension(write, 1, "_STAMMBAUM_LOCATIONS", p.locations);
  extension(write, 1, "_STAMMBAUM_NAME", p.name || "");
}

function familyLinks(write, id, people, fams, version) {
  for (const fam of fams.filter(fam => fam.children.includes(id))) {
    write(1, "FAMC", fam.xref);
    if (fam.adults.every(parent => parentType(people, parent, id) === "biological")) write(2, "PEDI", version === 7 ? "BIRTH" : "birth");
    const adoptive = fam.adults.filter(parent => parentType(people, parent, id) === "adoptive");
    if (adoptive.length) {
      if (adoptive.length === fam.adults.length) write(2, "PEDI", version === 7 ? "ADOPTED" : "adopted");
      const selector = adoptive.length === 2 ? "BOTH" : adoptive[0] === fam.slots[1] ? "WIFE" : "HUSB";
      write(1, "ADOP"); write(2, "FAMC", fam.xref); write(3, "ADOP", selector);
    }
  }
  for (const fam of fams.filter(fam => fam.adults.includes(id))) write(1, "FAMS", fam.xref);
}

function familyRecords(write, people, fams, pointer, hidden) {
  for (const fam of fams) {
    const [husband, wife] = fam.slots, [a, b] = fam.adults;
    write(0, `${fam.xref} FAM`);
    if (husband) write(1, "HUSB", pointer(husband));
    if (wife) write(1, "WIFE", pointer(wife));
    for (const child of fam.children) write(1, "CHIL", pointer(child));
    if (fam.partnership) {
      const own = partnerDetail(people, a, b), reverse = partnerDetail(people, b, a);
      const married = own.kind === "marriage" || [own.status, reverse.status].some(status => ["verheiratet", "geschieden", "verwitwet"].includes(status));
      const secret = hidden(a) || hidden(b);
      if (married) {
        write(1, "MARR", "Y");
        if (own.start && !secret) write(2, "DATE", gedcomDate(own.start));
      }
      if ([own.status, reverse.status].includes("geschieden")) {
        write(1, "DIV", "Y");
        if (own.end && !secret) write(2, "DATE", gedcomDate(own.end));
      }
    }
  }
}

const hiddenTest = (people, includeLiving) => id => !includeLiving && people[id]?.living !== false && !people[id]?.death;
// Relationship extension without dates or sources that would reveal a hidden living person.
function relationsFor(p, hidden, selfHidden, includeSources = true) {
  if (includeSources && !selfHidden && !Object.keys(p.partnerDetails || {}).some(hidden)) return p;
  const copy = { ...p };
  if (p.partnerDetails) copy.partnerDetails = Object.fromEntries(Object.entries(p.partnerDetails).map(([other, detail]) => [other, selfHidden || hidden(other) ? { ...(detail.kind ? { kind: detail.kind } : {}), ...(detail.status ? { status: detail.status } : {}) } : detail]));
  if ((!includeSources || selfHidden) && p.parentDetails) copy.parentDetails = Object.fromEntries(Object.entries(p.parentDetails).map(([parent, detail]) => [parent, { ...(!selfHidden && detail.label ? { label: detail.label } : {}), ...(detail.type ? { type: detail.type } : {}) }]));
  return copy;
}

// GEDCOM 5.5.1: exchange format in one language, without sources.
/** @param {any} data @param {string} [lang] @param {{ includeLiving?: boolean, now?: Date }} [options] */
export function exportGedcom(data, lang = "de", { includeLiving = true, now = undefined } = {}) {
  const code = language(lang);
  const people = data?.people || {}, ids = Object.keys(people);
  const xref = new Map(ids.map((id, i) => [id, `@I${i + 1}@`]));
  const pointer = id => { if (!xref.has(id)) throw new Error(`Unknown person: ${id}`); return xref.get(id); };
  const hidden = hiddenTest(people, includeLiving);
  const fams = familyIndex(people);
  const lines = [];
  const write = (level, tag, value) => {
    if (value === undefined || value === null || value === "") { lines.push(`${level} ${tag}`); return; }
    if (level === 0 || isPointer(tag, value)) { lines.push(`${level} ${tag} ${value}`); return; }
    lines.push(...lines551(level, tag, value));
  };
  write(0, "HEAD");
  write(1, "SOUR", "FAMILIENSTAMMBAUM"); write(2, "NAME", "Familienstammbaum");
  write(1, "DATE", today(now));
  write(1, "SUBM", "@U1@");
  write(1, "GEDC"); write(2, "VERS", "5.5.1"); write(2, "FORM", "LINEAGE-LINKED");
  write(1, "CHAR", "UTF-8");
  write(1, "LANG", LANGUAGE_551[code]);
  write(1, "NOTE", SOURCES_NOTE[code]);
  write(0, "@U1@ SUBM"); write(1, "NAME", data?.meta?.title || "Familienstammbaum");
  for (const id of ids) {
    const p = people[id], anonymous = hidden(id);
    write(0, `${pointer(id)} INDI`);
    nameLines(write, p, anonymous, code, 5);
    personBody(write, p, { lang: code, version: 5, anonymous });
    familyLinks(write, id, people, fams, 5);
    personExtensions(write, p, pointer, anonymous);
    if (!anonymous) extension(write, 1, "_STAMMBAUM_ID", id);
    extension(write, 1, "_STAMMBAUM_REL", { version: 1, ...mapRelationships(relationsFor(p, hidden, anonymous, false), pointer) });
  }
  familyRecords(write, people, fams, pointer, hidden);
  write(0, "TRLR");
  return lines.join("\n") + "\n";
}

// --- GEDCOM 7 -------------------------------------------------------------

const EXTENSIONS_7 = ["_STAMMBAUM_ID", "_STAMMBAUM_REL", "_STAMMBAUM_NAME", "_STAMMBAUM_DISPLAY_NAME", "_STAMMBAUM_EVIDENCE",
  "_STAMMBAUM_BIRTH_SURNAME", "_STAMMBAUM_LIVING", "_STAMMBAUM_LOCATIONS", "_STAMMBAUM_URL", "_STAMMBAUM_CATEGORY", "_STAMMBAUM_LINKS", "_STAMMBAUM_SOURCE_ID"];
const MEDIA = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", json: "application/json", md: "text/markdown" };
const mediaType = path => MEDIA[String(path).split(/[?#]/)[0].split(".").pop().toLowerCase()] || "application/octet-stream";
const variantPath = (base, code) => code === "de" ? base : base.replace(/\.pdf$/i, `.${code}.pdf`);

/**
 * GEDCOM 7 for a GEDZIP package.
 * options.language: de, en or pt – notes, occupation and PDF variants in that language
 *   (German fallback per field and per document). Gramps and most programs ignore GEDCOM translations.
 * options.sourceFiles: Set of published/pending file URLs, used to pick PDF language variants.
 * Returns the GEDCOM text and the files to place next to it in the archive.
 */
/** @param {any} data @param {{ language?: string, includeLiving?: boolean, sourceFiles?: Set<string>, categories?: Record<string, string>, now?: Date }} [options] */
export function exportGedcom7(data, { language: lang = "de", includeLiving = true, sourceFiles = new Set(), categories = data?.sourceCategories || {}, now = undefined } = {}) {
  const main = language(lang);
  const people = data?.people || {}, ids = Object.keys(people);
  const xref = new Map(ids.map((id, i) => [id, `@I${i + 1}@`]));
  const pointer = id => { if (!xref.has(id)) throw new Error(`Unknown person: ${id}`); return xref.get(id); };
  const hidden = hiddenTest(people, includeLiving);
  const fams = familyIndex(people);
  const lines = [];
  const write = (level, tag, value) => {
    if (value === undefined || value === null || value === "") { lines.push(`${level} ${tag}`); return; }
    if (level === 0 || isPointer(tag, value)) { lines.push(`${level} ${tag} ${value}`.trim()); return; }
    lines.push(...lines7(level, tag, value));
  };
  const files = new Map(); // archive path → URL to fetch
  const objects = new Map(); // key → { xref, files: [{path, form, title}] }
  const object = (key, entries) => {
    if (!objects.has(key)) objects.set(key, { xref: `@O${objects.size + 1}@`, files: entries });
    return objects.get(key).xref;
  };
  const sources = new Map(); // document key → { xref, title, obje, category }
  const documentKey = url => String(url).replace(String(url).startsWith("/") ? /[?#].*$/ : /#.*$/, "").replace(/\.(en|pt)\.pdf$/i, ".pdf");
  const sourceRecord = (url, label) => {
    const key = url ? documentKey(url) : `label:${label || ""}`;
    if (!sources.has(key)) {
      let entries;
      if (key.startsWith("/sources/")) {
        const translated = main !== "de" && sourceFiles.has(variantPath(key, main)) ? variantPath(key, main) : key;
        const path = translated.slice(1); files.set(path, translated);
        entries = [{ path, form: mediaType(path) }];
      } else if (/^https?:\/\//.test(key)) entries = [{ path: key, form: "text/html" }];
      else if (key.startsWith("/")) { const path = key.slice(1); files.set(path, key); entries = [{ path, form: mediaType(path) }]; }
      else entries = [];
      // Collections are titled by their name, other documents by the label without page reference.
      const metadata = data.sourceDetails?.[key];
      const collection = /\s–\s([^–]+?),\s*[A-Z]{1,3}\d{2,}$/.exec(String(label || ""))?.[1];
      const title = metadata?.title || collection || String(label || key).replace(/,\s*(?:S\.|p\.)\s*[\d–\-, ]+$/, "");
      sources.set(key, { xref: `@S${sources.size + 1}@`, title, id: metadata?.id, citation: metadata?.citation, obje: entries.length ? object(`doc:${key}`, entries) : null, category: categories[key] });
    }
    return sources.get(key);
  };
  const citation = (level, source) => {
    const record = sourceRecord(source.url, source.label);
    write(level, "SOUR", record.xref);
    const page = /#page=(\d+)/.exec(source.url)?.[1];
    const reference = /\s–\s([^–]+?,\s*[A-Z]{1,3}\d{2,})$/.exec(source.label || "")?.[1] || /,\s*((?:S\.|p\.)\s*[\d–\-, ]+)$/.exec(source.label || "")?.[1];
    const pageText = [reference, page ? `${PDF_PAGE[main]} ${page}` : null].filter(Boolean).join(", ");
    if (pageText) write(level + 1, "PAGE", pageText);
    if (source.label) write(level + 1, "NOTE", source.label);
    extension(write, level + 1, "_STAMMBAUM_URL", source.url);
  };
  // One NOTE per note, tagged with the language of its text (German where no translation exists).
  const notesOf = (p) => {
    const translated = main !== "de" && (p[`notes_${main}`] || []).some(note => String(note).trim());
    for (const note of personContent(p, main).notes) { write(1, "NOTE", note); write(2, "LANG", translated ? main : "de"); }
  };
  const version7 = (write, p) => {
    const content = personContent(p, main);
    if (content.occupation) write(1, "OCCU", content.occupation);
    notesOf(p);
    if (p.photo) {
      const path = p.photo.slice(1); files.set(path, p.photo);
      write(1, "OBJE", object(`photo:${p.photo}`, [{ path, form: mediaType(path) }]));
    }
    for (const source of p.sources || []) citation(1, source);
  };

  write(0, "HEAD");
  write(1, "GEDC"); write(2, "VERS", "7.0");
  write(1, "SCHMA");
  for (const tag of EXTENSIONS_7) write(2, "TAG", `${tag} https://familienstammbaum.invalid/gedcom/${tag}`);
  write(1, "SOUR", "FAMILIENSTAMMBAUM"); write(2, "NAME", "Familienstammbaum");
  write(1, "DATE", today(now));
  write(1, "SUBM", "@U1@");
  write(1, "LANG", main);
  write(0, "@U1@ SUBM"); write(1, "NAME", data?.meta?.title || "Familienstammbaum");
  for (const id of ids) {
    const p = people[id], anonymous = hidden(id);
    write(0, `${pointer(id)} INDI`);
    nameLines(write, p, anonymous, main, 7);
    personBody(write, p, { lang: main, version: 7, anonymous, version7 });
    familyLinks(write, id, people, fams, 7);
    personExtensions(write, p, pointer, anonymous);
    if (!anonymous) extension(write, 1, "_STAMMBAUM_ID", id);
    // Parent-detail sources travel inside the relationship extension; package their files too.
    if (!anonymous) for (const source of Object.values(p.parentDetails || {}).flatMap(detail => detail.sources || [])) sourceRecord(source.url, source.label);
    extension(write, 1, "_STAMMBAUM_REL", { version: 1, ...mapRelationships(relationsFor(p, hidden, anonymous), pointer) });
  }
  familyRecords(write, people, fams, pointer, hidden);
  for (const [, record] of sources) {
    write(0, `${record.xref} SOUR`);
    write(1, "TITL", record.title);
    if (record.id) { write(1, "REFN", record.id); extension(write, 1, "_STAMMBAUM_SOURCE_ID", record.id); }
    if (record.citation) write(1, "TEXT", record.citation);
    if (record.obje) write(1, "OBJE", record.obje);
    if (record.category) extension(write, 1, "_STAMMBAUM_CATEGORY", record.category);
  }
  for (const [, record] of objects) {
    write(0, `${record.xref} OBJE`);
    for (const file of record.files) {
      write(1, "FILE", file.path); write(2, "FORM", file.form);
      if (file.title) write(2, "TITL", file.title);
    }
  }
  write(0, "TRLR");
  return { text: lines.join("\n") + "\n", files: [...files].map(([path, url]) => ({ path, url })) };
}

// --- Import (5.5.1 and 7) -----------------------------------------------------

/** @param {string} text @returns {{ meta: { title: string, focusPersonId: string }, people: Record<string, any>, sourceCategories?: Record<string, string>, sourceDetails?: Record<string, any>, mediaFiles?: string[] }} */
export function importGedcom(text) {
  const records = [], stack = [];
  for (const raw of String(text).replace(/^﻿/, "").split(/\r?\n/)) {
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
  const header = records.find(record => record.tag === "HEAD");
  const version7 = /^7\./.test(find(find(header, "GEDC"), "VERS")?.value || "");
  const unescape = value => version7 ? value.replace(/^@@/, "@") : value.replace(/@@/g, "@");
  const textOf = node => node ? version7
    ? unescape(node.value) + node.children.filter(child => child.tag === "CONT").map(child => "\n" + unescape(child.value)).join("")
    : unescape(node.value + node.children.filter(child => ["CONC", "CONT"].includes(child.tag)).map(child => (child.tag === "CONT" ? "\n" : "") + child.value).join("")) : "";
  const extension = (node, tag) => { const field = find(node, tag); return field ? JSON.parse(textOf(field)) : undefined; };
  const byPointer = new Map(records.filter(record => record.xref).map(record => [record.xref, record]));
  const people = Object.create(null), byXref = new Map(), nodes = new Map(), packed = new Map();
  const media = new Set(), categories = {}, sourceDetails = {};
  const fileOf = obje => { const record = byPointer.get(obje?.value) || obje; return all(record, "FILE").map(file => file.value).filter(Boolean); };
  const individuals = records.filter(record => record.tag === "INDI");
  for (const record of individuals) {
    const names = all(record, "NAME");
    const typeOf = node => (find(node, "TYPE")?.value || "").toLowerCase();
    const shown = names.find(node => ["married", "aka"].includes(typeOf(node))) || names[0];
    const flat = node => (textOf(node) || "").replace(/\//g, "").replace(/\s+/g, " ").trim();
    const stored = extension(record, "_STAMMBAUM_NAME");
    const name = typeof stored === "string" && stored.trim() ? stored : flat(shown) || "Unbekannt";
    const originalId = extension(record, "_STAMMBAUM_ID");
    const base = typeof originalId === "string" && originalId ? originalId : name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "person";
    let id = base, n = 2;
    while (Object.hasOwn(people, id)) id = `${base}_${n++}`;
    const p = { name };
    for (const [field, event] of [["birth", "BIRT"], ["death", "DEAT"]]) {
      const date = find(find(record, event), "DATE")?.value;
      if (date) {
        const internal = internalDate(date);
        if (internal) p[field] = internal; else (p._dateNotes ||= []).push(`GEDCOM ${event} DATE: ${date}`);
      }
      const place = textOf(find(find(record, event), "PLAC"));
      if (place) p[`${field}Place`] = place;
    }
    const links = extension(record, "_STAMMBAUM_LINKS");
    if (links !== undefined) {
      if (!validWebLinks(links)) throw new Error("Invalid _STAMMBAUM_LINKS.");
      if (links.length) p.links = links;
    }
    const displayName = extension(record, "_STAMMBAUM_DISPLAY_NAME");
    if (displayName !== undefined) {
      if (typeof displayName !== "string") throw new Error("Invalid _STAMMBAUM_DISPLAY_NAME.");
      if (displayName.trim()) p.displayName = displayName;
    }
    const evidenceStatus = extension(record, "_STAMMBAUM_EVIDENCE");
    if (evidenceStatus !== undefined) {
      if (!["unsicher", "gut", "gesichert"].includes(evidenceStatus)) throw new Error("Invalid _STAMMBAUM_EVIDENCE status.");
      p.evidenceStatus = evidenceStatus;
    }
    const birthSurname = extension(record, "_STAMMBAUM_BIRTH_SURNAME");
    if (birthSurname !== undefined) {
      if (typeof birthSurname !== "string") throw new Error("Invalid _STAMMBAUM_BIRTH_SURNAME.");
      if (birthSurname.trim()) p.birthSurname = birthSurname;
    } else {
      const birthName = names.find(node => typeOf(node) === "birth");
      const surname = birthName && (textOf(find(birthName, "SURN")) || /\/([^/]+)\//.exec(textOf(birthName))?.[1]);
      if (surname && surname.trim()) p.birthSurname = surname.trim();
    }
    const locations = extension(record, "_STAMMBAUM_LOCATIONS");
    if (locations !== undefined) {
      if (!Array.isArray(locations)) throw new Error("Invalid _STAMMBAUM_LOCATIONS.");
      p.locations = locations;
    }
    const occupation = textOf(find(record, "OCCU")); if (occupation) p.occupation = occupation;
    const sex = find(record, "SEX")?.value; if (["M", "F"].includes(sex)) p.gender = sex.toLowerCase();
    if (sex === "X" || find(record, "_GENDER")?.value === "d") p.gender = "d";
    // Exports carry one language; like occupation, their notes return to the base fields.
    const notes = [...all(record, "NOTE").map(textOf).filter(Boolean), ...(p._dateNotes || [])]; delete p._dateNotes;
    if (notes.length) p.notes = notes;
    const living = extension(record, "_STAMMBAUM_LIVING");
    if (living !== undefined) {
      if (typeof living !== "boolean") throw new Error("Invalid _STAMMBAUM_LIVING.");
      p.living = living;
    } else p.living = find(record, "DEAT") ? false : defaultLiving(p);
    for (const obje of all(record, "OBJE")) {
      const path = fileOf(obje).find(file => !/^https?:/.test(file));
      if (path && !p.photo && /^photos\/[a-zA-Z0-9._-]+\.(?:png|jpe?g)$/i.test(path)) { p.photo = `/${path}`; media.add(path); }
    }
    const sources = [];
    for (const cite of all(record, "SOUR")) {
      const source = byPointer.get(cite.value);
      const stored = extension(cite, "_STAMMBAUM_URL");
      const url = stored !== undefined ? String(stored) : (() => {
        const file = fileOf(find(source, "OBJE"))[0];
        return file ? (/^https?:/.test(file) ? file : `/${file}`) : "";
      })();
      const label = textOf(find(cite, "NOTE")) || [textOf(find(source, "TITL")), textOf(find(cite, "PAGE"))].filter(Boolean).join(", ");
      if (!url && !label) continue;
      sources.push({ label, url });
      for (const file of fileOf(find(source, "OBJE"))) if (!/^https?:/.test(file)) media.add(file);
      const category = extension(source, "_STAMMBAUM_CATEGORY");
      if (typeof category === "string" && url) categories[url.replace(/#.*$/, "").replace(/\.(en|pt)\.pdf$/i, ".pdf")] = category;
    }
    if (sources.length) p.sources = sources;
    people[id] = p; byXref.set(record.xref, id); nodes.set(id, record);
    const detail = extension(record, "_STAMMBAUM_REL");
    if (detail !== undefined) {
      if (!detail || typeof detail !== "object" || detail.version !== 1) throw new Error("Unsupported _STAMMBAUM_REL data.");
      packed.set(id, detail);
    }
  }
  // Files of sources cited only inside parent details.
  for (const source of records.filter(record => record.tag === "SOUR")) {
    for (const file of fileOf(find(source, "OBJE"))) if (!/^https?:/.test(file)) media.add(file);
    const category = extension(source, "_STAMMBAUM_CATEGORY"), file = fileOf(find(source, "OBJE")).find(f => !/^https?:/.test(f));
    const sourceId = extension(source, "_STAMMBAUM_SOURCE_ID");
    const title = textOf(find(source, "TITL"));
    if (file && title && sourceId) sourceDetails[/^https?:/.test(file) ? file : `/${file.replace(/\.(en|pt)\.pdf$/i, ".pdf")}`] = { title, id: sourceId, ...(textOf(find(source, "TEXT")) ? { citation: textOf(find(source, "TEXT")) } : {}) };
    if (typeof category === "string" && file) categories[`/${file.replace(/\.(en|pt)\.pdf$/i, ".pdf")}`] = category;
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
        if (start && internalDate(start)) detail.start = internalDate(start); if (end && internalDate(end)) detail.end = internalDate(end);
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
      if (pedi === "birth") for (const parent of adults) setType(child, parent, version7 ? "unknown" : "biological", version7 ? "GEDCOM 7: BIRTH" : undefined);
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
  const result = { meta: { title: "GEDCOM import", focusPersonId: Object.keys(people)[0] }, people };
  if (Object.keys(categories).length) result.sourceCategories = categories;
  if (Object.keys(sourceDetails).length) result.sourceDetails = sourceDetails;
  // Archive paths referenced by the file (GEDZIP: files next to gedcom.ged).
  Object.defineProperty(result, "mediaFiles", { value: [...media], enumerable: false });
  return result;
}
