import YAML from "yaml";
import { contentHash } from "../shared/content-hash.mjs";
import { validateDataset } from "../shared/validate.mjs";

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

  if (!token || !repo) {
    return bad(
      "Central saving is not configured yet. Requires GITHUB_TOKEN and GITHUB_REPO.",
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid JSON.");
  }

  // Full integrity check before anything is committed: the same rules the
  // build runs, so a sync can never push a YAML that breaks the next deploy.
  const data = body?.data;
  const problems = validateDataset(data, { label: "dataset" });
  if (problems.length) {
    return bad(
      `Validation failed – nothing was saved:\n${problems.slice(0, 12).join("\n")}` +
      (problems.length > 12 ? `\n… and ${problems.length - 12} more.` : ""),
      422
    );
  }

  const tree = String(body?.tree || "family");
  if (!/^[a-z0-9_-]+$/.test(tree)) return bad("Invalid dataset name.");
  const path = `data/trees/${tree}.yaml`;
  const api = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const headers = {
    "accept": "application/vnd.github+json",
    "authorization": `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "familienstammbaum-netlify"
  };

  let sha = null;
  let currentHash = null;
  const current = await fetch(api, { headers });
  if (current.ok) {
    if (body?.create) return bad(`Dataset '${tree}' already exists.`, 409);
    const info = await current.json();
    sha = info?.sha;
    if (info?.content) currentHash = contentHash(Buffer.from(info.content, "base64").toString("utf8"));
  } else if (current.status === 404) {
    if (!body?.create) return bad(`Dataset '${tree}' does not exist.`);
  } else {
    return bad(`Current YAML file could not be read from GitHub (${current.status}).`, 502);
  }

  // Sync version guard: a sync based on an outdated central state is
  // rejected instead of silently overwriting the changes in between.
  const baseHash = typeof body?.baseHash === "string" && body.baseHash ? body.baseHash : null;
  if (baseHash && currentHash && baseHash !== currentHash) {
    return bad(
      "The central dataset has changed since your draft started – nothing was saved. " +
      "Reload to review the current state, then redo your changes or discard the draft.",
      409
    );
  }

  const yamlText = YAML.stringify(data, { lineWidth: 0 });
  const content = Buffer.from(yamlText, "utf8").toString("base64");

  const save = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {...headers, "content-type": "application/json"},
    body: JSON.stringify({
      message: `Update dataset ${tree} (${new Date().toISOString().slice(0,10)})`,
      content,
      ...(sha ? { sha } : {}),
      branch
    })
  });

  const result = await save.json().catch(() => ({}));
  if (!save.ok) {
    return bad(result?.message || `GitHub save failed (${save.status}).`, 502);
  }

  return Response.json({
    ok: true,
    commit: result?.commit?.sha?.slice(0, 10) || null,
    contentHash: contentHash(yamlText)
  });
};
