// File rules for the upload and delete endpoints, shared by the GitHub
// functions and the local server. Both sides used to carry their own regexes,
// which had already drifted apart: chronicle files (.md/.yaml) passed the
// upload but were rejected by the delete filename check.

const EXTENSIONS = {
  photo: /\.(png|jpe?g)$/i,
  chronicle: /\.(md|ya?ml)$/i,
  source: /\.(pdf|png|jpe?g)$/i
};
const KIND_MESSAGE = {
  photo: "Only PNG or JPG allowed for photos.",
  chronicle: "Only Markdown or YAML allowed for the chronicle.",
  source: "Only PDF, PNG or JPG allowed."
};
const TREE_RE = /^[a-z0-9_-]+$/;

export const KINDS = Object.keys(EXTENSIONS);

export function normalizeKind(kind) {
  return KINDS.includes(kind) ? kind : "source";
}

// Reduce an arbitrary client-supplied name to a safe repository filename.
// Path separators collapse into "-", so nothing can escape its directory.
export function sanitizeFilename(raw) {
  return String(raw || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|-+$/g, "")
    .toLowerCase();
}

// Resolve an upload/delete request to { dir, filename } under public/,
// or { error } with a message ready to return to the client.
export function resolveTarget({ kind, tree, filename, sanitize = true }) {
  const k = normalizeKind(kind);
  const name = sanitize ? sanitizeFilename(filename) : String(filename || "");

  if (!name) return { error: "A filename is required." };
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) return { error: "Invalid filename." };
  if (!EXTENSIONS[k].test(name)) return { error: KIND_MESSAGE[k] };

  if (k === "chronicle") {
    const t = String(tree || "");
    if (!TREE_RE.test(t)) return { error: "Invalid tree." };
    return { kind: k, dir: `chronicle/${t}`, filename: name };
  }
  return { kind: k, dir: k === "photo" ? "photos" : "sources", filename: name };
}
