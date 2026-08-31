function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

import { requireAdmin } from "./_auth.mjs";

export default async (request) => {
  if (request.method !== "POST") return bad("Method Not Allowed", 405);
  const forbidden = await requireAdmin(request);
  if (forbidden) return forbidden;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) return bad("GITHUB_TOKEN and GITHUB_REPO must be configured.", 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON.");
  }

  const rawName = String(body?.filename || "");
  const contentBase64 = String(body?.contentBase64 || "");
  // kind: "source" (default, public/sources) or "photo" (public/photos)
  const kind = body?.kind === "photo" ? "photo" : body?.kind === "chronicle" ? "chronicle" : "source";
  const tree = String(body?.tree || "");
  if (kind === "chronicle" && !/^[a-z0-9_-]+$/.test(tree)) return bad("Invalid tree.");
  const dir = kind === "photo" ? "photos" : kind === "chronicle" ? `chronicle/${tree}` : "sources";
  if (!rawName || !contentBase64) return bad("filename und contentBase64 sind erforderlich.");
  if (contentBase64.length > 6 * 1024 * 1024) return bad("File too large (max. ~4 MB).", 413);

  const filename = rawName
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  const allowed = kind === "photo" ? /\.(png|jpe?g)$/ : kind === "chronicle" ? /\.(md|ya?ml)$/ : /\.(pdf|png|jpe?g)$/;
  if (!allowed.test(filename)) {
    return bad(kind === "photo" ? "Only PNG or JPG allowed for photos."
      : kind === "chronicle" ? "Only Markdown or YAML allowed for the chronicle."
      : "Only PDF, PNG or JPG allowed.");
  }

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "familienstammbaum-netlify",
    "content-type": "application/json"
  };
  const api = `https://api.github.com/repos/${repo}/contents/public/${dir}/${encodeURIComponent(filename)}`;

  // If the file already exists, pass its sha (overwrite).
  let sha;
  const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.ok) sha = (await existing.json())?.sha;

  const save = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Upload ${kind}: ${filename}`,
      content: contentBase64,
      branch,
      ...(sha ? { sha } : {})
    })
  });
  const result = await save.json().catch(() => ({}));
  if (!save.ok) return bad(result?.message || `GitHub save failed (${save.status}).`, 502);

  return Response.json({ ok: true, filename, commit: result?.commit?.sha?.slice(0, 10) || null });
};
