import { requireAdmin } from "./_auth.mjs";

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export default async (request) => {
  if (request.method !== "POST") return bad("Method Not Allowed", 405);
  const forbidden = await requireAdmin(request);
  if (forbidden) return forbidden;

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) return bad("GITHUB_TOKEN und GITHUB_REPO müssen in Netlify konfiguriert sein.", 503);

  let body;
  try { body = await request.json(); } catch { return bad("Ungültiges JSON."); }
  const tree = String(body?.tree || "");
  if (!/^[a-z0-9_-]+$/.test(tree)) return bad("Ungültiger Datensatz-Name.");

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "familienstammbaum-netlify",
    "content-type": "application/json"
  };

  // Datensatz muss existieren
  const treeCheck = await fetch(
    `https://api.github.com/repos/${repo}/contents/data/trees/${encodeURIComponent(tree)}.yaml?ref=${encodeURIComponent(branch)}`,
    { headers }
  );
  if (!treeCheck.ok) return bad(`Datensatz '${tree}' existiert nicht.`);

  const api = `https://api.github.com/repos/${repo}/contents/data/default-tree.txt`;
  let sha;
  const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers });
  if (existing.ok) sha = (await existing.json())?.sha;

  const save = await fetch(api, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: `Standard-Datensatz: ${tree}`,
      content: Buffer.from(`${tree}\n`, "utf8").toString("base64"),
      branch,
      ...(sha ? { sha } : {})
    })
  });
  const result = await save.json().catch(() => ({}));
  if (!save.ok) return bad(result?.message || `GitHub-Speichern fehlgeschlagen (${save.status}).`, 502);

  return Response.json({ ok: true, tree, commit: result?.commit?.sha?.slice(0, 10) || null });
};
