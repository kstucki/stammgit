import JSZip from "jszip";
import { roleFromRequest } from "./_auth.mjs";

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

export default async (request) => {
  // This endpoint reads every source document out of a possibly private
  // repository. It must not rely on the edge function alone for its gate.
  if (!(await roleFromRequest(request))) {
    return Response.json({ error: "Sign-in required." }, { status: 403 });
  }

  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) return bad("GITHUB_TOKEN and GITHUB_REPO must be configured.", 503);

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
  if (!list.ok) return bad(`Sources folder could not be read (${list.status}).`, 502);
  const entries = await list.json();
  const files = (Array.isArray(entries) ? entries : []).filter((e) => e.type === "file");
  if (!files.length) return bad("The sources folder is empty.", 404);

  const zip = new JSZip();
  for (const f of files) {
    // Fetch each file via the contents API (returns Base64, works for private repos too)
    const res = await fetch(
      `https://api.github.com/repos/${repo}/contents/public/sources/${encodeURIComponent(f.name)}?ref=${encodeURIComponent(branch)}`,
      { headers: { ...headers, accept: "application/vnd.github.raw+json" } }
    );
    if (!res.ok) return bad(`File ${f.name} could not be loaded (${res.status}).`, 502);
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
