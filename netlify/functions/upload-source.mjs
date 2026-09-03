function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

import { requireAdmin } from "./_auth.mjs";
import { resolveTarget } from "../shared/upload-rules.mjs";

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

  const contentBase64 = String(body?.contentBase64 || "");
  if (!body?.filename || !contentBase64) return bad("filename and contentBase64 are required.");
  if (contentBase64.length > 6 * 1024 * 1024) return bad("File too large (max. ~4 MB).", 413);

  // kind: "source" (default, public/sources), "photo" (public/photos)
  // or "chronicle" (public/chronicle/<tree>) \u2013 rules shared with delete-source.
  const target = resolveTarget({ kind: body?.kind, tree: body?.tree, filename: body.filename });
  if (target.error) return bad(target.error);
  const { dir, filename, kind } = target;

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
