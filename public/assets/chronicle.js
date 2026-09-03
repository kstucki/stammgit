// Chronicle chapters: pure parsing and rendering, no DOM (testable in Node).
// A chapter is a Markdown file with a small YAML-ish frontmatter block
// (title, optional date) and [[p:person_id]] / [[s:source_url]] tokens in
// the text that link into the tree.
import { marked, Renderer } from "./vendor/marked.esm.js";

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
    const value = m[2].split("|")[0].trim(); // optional |Label is display-only
    if (m[1] === "p" && !persons.includes(value)) persons.push(value);
    if (m[1] === "s" && !sources.includes(value)) sources.push(value);
    if (m[1] === "c" && !chapters.includes(value)) chapters.push(value);
  }
  return { persons, sources, chapters };
}

function slugify(text) {
  return String(text).toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss" }[c]))
    .replace(/\[\[[psc]:[^\]]+\]\]/g, "")
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

// A chapter is prose, not a template: chapters can arrive through a pull
// request or a scoped GitHub token without ever passing the admin password,
// so raw HTML is shown as text and only harmless link protocols survive.
// See containsRawHtml() for the matching build-time check.
export const isSafeUrl = (url) => {
  const value = String(url || "").trim();
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) {
    return /^(https?|mailto):/i.test(value);
  }
  return !value.startsWith("//"); // relative paths and anchors stay allowed
};

const SAFE_RENDERER = new Renderer();
SAFE_RENDERER.html = (html) => escapeHtml(html);
SAFE_RENDERER.link = function (href, title, text) {
  if (!isSafeUrl(href)) return text;
  return Renderer.prototype.link.call(this, href, title, text);
};
SAFE_RENDERER.image = function (href, title, text) {
  if (!isSafeUrl(href)) return escapeHtml(text);
  return Renderer.prototype.image.call(this, href, title, text);
};

const RAW_HTML = /<\/?[a-zA-Z][^>]*>/;

// Lines that would have carried raw HTML into the page. Used by the build to
// reject a chapter outright instead of silently escaping it in the browser.
export function containsRawHtml(body) {
  return String(body).split(/\r?\n/).reduce((hits, line, i) => {
    // Token syntax and fenced code are not HTML; indented code is rare enough
    // in a chronicle that a false positive is a fair price for the guarantee.
    if (RAW_HTML.test(line.replace(/`[^`]*`/g, ""))) hits.push(i + 1);
    return hits;
  }, []);
}

// Render a chapter body to HTML. Resolvers supply display labels:
//   personLabel(id) -> string | null (null marks a broken link)
//   sourceLabel(url) -> string
//   chapterLabel(ref) -> string | null for [[c:file.md]] or [[c:file.md#slug]]
export function renderChapter(body, { personLabel, sourceLabel, chapterLabel } = {}) {
  // Tokens are rendered to HTML, but they must not travel through marked as
  // raw HTML — that path is closed. They are parked as placeholders from the
  // Private Use Area (marked leaves them untouched, they cannot occur in real
  // prose) and swapped back in after parsing.
  const parked = [];
  const park = (html) => `${parked.push(html) - 1}`;
  const withLinks = String(body).replace(TOKEN, (_, kind, raw) => {
    const [rawValue, ...labelParts] = raw.split("|");
    const value = rawValue.trim();
    const custom = labelParts.join("|").trim() || null; // [[p:id|Label]]
    if (kind === "p") {
      const label = custom ?? (personLabel ? personLabel(value) : value);
      if ((label === null || label === undefined) || (custom && personLabel && personLabel(value) === null)) {
        return park(`<span class="chronicle-broken">${escapeHtml(value)}</span>`);
      }
      return park(`<a href="#" data-person="${escapeHtml(value)}">${escapeHtml(label)}</a>`);
    }
    if (kind === "c") {
      const [file, section] = value.split("#");
      const label = custom ?? (chapterLabel ? chapterLabel(value) : null);
      if ((label === null || label === undefined) || (custom && chapterLabel && chapterLabel(value) === null)) {
        return park(`<span class="chronicle-broken">${escapeHtml(value)}</span>`);
      }
      return park(`<a href="#" data-chapter="${escapeHtml(file)}"${section ? ` data-section="${escapeHtml(section)}"` : ""}>${escapeHtml(label)}</a>`);
    }
    const label = custom || (sourceLabel && sourceLabel(value)) || value.split("/").pop();
    if (!isSafeUrl(value)) return park(`<span class="chronicle-broken">${escapeHtml(label)}</span>`);
    return park(`<a href="${escapeHtml(value)}" target="_blank" class="chronicle-source">${escapeHtml(label)}</a>`);
  });

  // Headings carry the same slug ids extractHeadings computes, so the table of
  // contents can deep-link into the chapter. Deriving them in the renderer
  // (instead of injecting <h2> into the source) keeps raw HTML blocked.
  const renderer = Object.create(SAFE_RENDERER);
  const used = new Set();
  renderer.heading = (text, level, raw) => {
    // marked hands over the whole source line; take the heading text the same
    // way extractHeadings does, so both sides produce identical slugs.
    const m = String(raw).match(/^#{2,6}\s+(.*?)\s*$/);
    let slug = slugify(m ? m[1] : raw);
    while (used.has(slug)) slug += "-2";
    used.add(slug);
    return `<h${level} id="${slug}">${text}</h${level}>\n`;
  };

  const html = marked.parse(withLinks, { async: false, renderer });
  return html.replace(/(\d+)/g, (_, i) => parked[Number(i)] ?? "");
}
