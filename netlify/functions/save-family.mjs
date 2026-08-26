import YAML from "yaml";

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
      "Zentrales Speichern ist noch nicht konfiguriert. Benötigt GITHUB_TOKEN und GITHUB_REPO in Netlify.",
      503
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Ungültiges JSON.");
  }

  const data = body?.data;
  if (!data || typeof data !== "object" || !data.people || typeof data.people !== "object") {
    return bad("Ungültige Stammbaumdaten.");
  }

  const count = Object.keys(data.people).length;
  if (count < 1 || count > 5000) return bad("Unplausible Anzahl Personen.");

  const tree = String(body?.tree || "family");
  if (!/^[a-z0-9_-]+$/.test(tree)) return bad("Ungültiger Datensatz-Name.");
  const path = `data/trees/${tree}.yaml`;
  const api = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
  const headers = {
    "accept": "application/vnd.github+json",
    "authorization": `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "familienstammbaum-netlify"
  };

  let sha = null;
  const current = await fetch(api, { headers });
  if (current.ok) {
    sha = (await current.json())?.sha;
  } else if (current.status === 404) {
    if (!body?.create) return bad(`Datensatz '${tree}' existiert nicht.`);
  } else {
    return bad(`Aktuelle YAML-Datei konnte nicht von GitHub gelesen werden (${current.status}).`, 502);
  }

  const yamlText = YAML.stringify(data, { lineWidth: 0 });
  const content = Buffer.from(yamlText, "utf8").toString("base64");

  const save = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: {...headers, "content-type": "application/json"},
    body: JSON.stringify({
      message: `Datensatz ${tree} aktualisiert (${new Date().toISOString().slice(0,10)})`,
      content,
      ...(sha ? { sha } : {}),
      branch
    })
  });

  const result = await save.json().catch(() => ({}));
  if (!save.ok) {
    return bad(result?.message || `GitHub-Speichern fehlgeschlagen (${save.status}).`, 502);
  }

  return Response.json({
    ok: true,
    commit: result?.commit?.sha?.slice(0, 10) || null
  });
};
