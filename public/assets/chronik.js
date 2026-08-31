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

const TOKEN = /\[\[([ps]):([^\]\n]+)\]\]/g;

// All person ids and source urls referenced in a chapter body.
export function extractTokens(body) {
  const persons = [], sources = [];
  for (const m of String(body).matchAll(TOKEN)) {
    const value = m[2].trim();
    if (m[1] === "p" && !persons.includes(value)) persons.push(value);
    if (m[1] === "s" && !sources.includes(value)) sources.push(value);
  }
  return { persons, sources };
}

const escapeHtml = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

// Render a chapter body to HTML. Resolvers supply display labels:
//   personLabel(id) -> string | null (null marks a broken link)
//   sourceLabel(url) -> string
export function renderChapter(body, { personLabel, sourceLabel } = {}) {
  const withLinks = String(body).replace(TOKEN, (_, kind, raw) => {
    const value = raw.trim();
    if (kind === "p") {
      const label = personLabel ? personLabel(value) : value;
      if (label === null || label === undefined) {
        return `<span class="chronik-broken">${escapeHtml(value)}</span>`;
      }
      return `<a href="#" data-person="${escapeHtml(value)}">${escapeHtml(label)}</a>`;
    }
    const label = (sourceLabel && sourceLabel(value)) || value.split("/").pop();
    return `<a href="${escapeHtml(value)}" target="_blank" class="chronik-source">${escapeHtml(label)}</a>`;
  });
  return marked.parse(withLinks, { async: false });
}
