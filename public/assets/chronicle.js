// Chronicle chapters: pure parsing and rendering, no DOM (testable in Node).
// A chapter is a Markdown file with a small YAML-ish frontmatter block
// (title, optional date) and [[p:person_id]] / [[s:source_url]] tokens in
// the text that link into the tree.
import { marked } from "./vendor/marked.esm.js";

// Parse "---\ntitle: ...\ndate: ...\n---\nbody" without a YAML dependency —
// the frontmatter is deliberately limited to simple "key: value" lines.
export function parseChapter(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const frontmatter = {};
  let body = String(text);
  if (m) {
    body = body.slice(m[0].length);
    for (const line of m[1].split(/\r?\n/)) {
      const kv = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
      if (kv) frontmatter[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
    }
  }
  return { frontmatter, body };
}

const TOKEN = /\[\[([psc]):([^\]\n]+)\]\]/g;

// All person ids and source urls referenced in a chapter body.
export function extractTokens(body) {
  const persons = [], sources = [], chapters = [];
  for (const m of String(body).matchAll(TOKEN)) {
    const value = m[2].trim();
    if (m[1] === "p" && !persons.includes(value)) persons.push(value);
    if (m[1] === "s" && !sources.includes(value)) sources.push(value);
    if (m[1] === "c" && !chapters.includes(value)) chapters.push(value);
  }
  return { persons, sources, chapters };
}

function slugify(text) {
  return String(text).toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" }[c]))
    .replace(/\[\[[ps]:[^\]]+\]\]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "abschnitt";
}

const HEADING = /^(#{2,4})\s+(.+?)\s*$/gm;

// Section headings (## to ####) with slugs, in document order. The slugs
// are deterministic and identical to the ids renderChapter emits, so the
// table of contents can deep-link into a chapter.
export function extractHeadings(body) {
  const out = [];
  const used = new Set();
  for (const m of String(body).matchAll(HEADING)) {
    let slug = slugify(m[2]);
    while (used.has(slug)) slug += "-2";
    used.add(slug);
    out.push({ level: m[1].length, text: m[2], id: slug });
  }
  return out;
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Render a chapter body to HTML. Resolvers supply display labels:
//   personLabel(id) -> string | null (null marks a broken link)
//   sourceLabel(url) -> string
//   chapterLabel(ref) -> string | null for [[c:file.md]] or [[c:file.md#slug]]
export function renderChapter(body, { personLabel, sourceLabel, chapterLabel } = {}) {
  // Headings become HTML with stable ids BEFORE token replacement, so the
  // slugs match extractHeadings on the raw body. marked passes the inline
  // HTML through; tokens inside headings are still replaced afterwards.
  const headings = extractHeadings(body);
  let hi = 0;
  const withIds = String(body).replace(HEADING, (m, hashes, text) => {
    const h = headings[hi++];
    return `<h${hashes.length} id="${h.id}">${text}</h${hashes.length}>`;
  });
  const withLinks = withIds.replace(TOKEN, (_, kind, raw) => {
    const value = raw.trim();
    if (kind === "p") {
      const label = personLabel ? personLabel(value) : value;
      if (label === null || label === undefined) {
        return `<span class="chronicle-broken">${escapeHtml(value)}</span>`;
      }
      return `<a href="#" data-person="${escapeHtml(value)}">${escapeHtml(label)}</a>`;
    }
    if (kind === "c") {
      const [file, section] = value.split("#");
      const label = chapterLabel ? chapterLabel(value) : null;
      if (label === null || label === undefined) {
        return `<span class="chronicle-broken">${escapeHtml(value)}</span>`;
      }
      return `<a href="#" data-chapter="${escapeHtml(file)}"${section ? ` data-section="${escapeHtml(section)}"` : ""}>${escapeHtml(label)}</a>`;
    }
    const label = (sourceLabel && sourceLabel(value)) || value.split("/").pop();
    return `<a href="${escapeHtml(value)}" target="_blank" class="chronicle-source">${escapeHtml(label)}</a>`;
  });
  return marked.parse(withLinks, { async: false });
}
