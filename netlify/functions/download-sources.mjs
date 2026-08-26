import JSZip from "jszip";

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export default async () => {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) return bad("GITHUB_TOKEN und GITHUB_REPO müssen in Netlify konfiguriert sein.", 503);

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "familienstammbaum-netlify"
  };

  const list = await fetch(
    `https://api.github.com/repos/${repo}/contents/public/sources?ref=${encodeURIComponent(branch)}`,
    { headers }
  );
  if (!list.ok) return bad(`Quellenordner konnte nicht gelesen werden (${list.status}).`, 502);
  const entries = await list.json();
  const files = (Array.isArray(entries) ? entries : []).filter((e) => e.type === "file");
  if (!files.length) return bad("Der Quellenordner ist leer.", 404);

  const zip = new JSZip();
  for (const f of files) {
    // Einzeldatei über die Contents-API holen (liefert Base64, funktioniert auch bei privaten Repos)
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/public/sources/${encodeURIComponent(f.name)}?ref=${encodeURIComponent(branch)}`,
      { headers: { ...headers, accept: "application/vnd.github.raw+json" } }
    );
    if (!res.ok) return bad(`Datei ${f.name} konnte nicht geladen werden (${res.status}).`, 502);
    zip.file(f.name, Buffer.from(await res.arrayBuffer()));
  }

  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new Response(buf, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="stammbaum-quellen.zip"'
    }
  });
};
