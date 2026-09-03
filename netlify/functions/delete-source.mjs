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

  // Same rules as the upload, minus the sanitizing: a delete has to match the
  // name as it sits in the repository (which may predate the upload endpoint).
  const target = resolveTarget({ kind: body?.kind, tree: body?.tree, filename: body?.filename, sanitize: false });
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

  const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (!existing.ok) return bad("File not found.", 404);
  const sha = (await existing.json())?.sha;

  const del = await fetch(api, {
    method: "DELETE",
    headers,
    body: JSON.stringify({ message: `Delete ${kind}: ${filename}`, sha, branch })
  });
  const result = await del.json().catch(() => ({}));
  if (!del.ok) return bad(result?.message || `GitHub delete failed (${del.status}).`, 502);

  return Response.json({ ok: true, commit: result?.commit?.sha?.slice(0, 10) || null });
};
