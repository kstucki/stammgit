// Standalone server: runs stammgit without Netlify.
//   npm run build && node server.mjs   →  http://localhost:8888
// Serves public/, mounts the same serverless handlers under
// /.netlify/functions/* and enforces the auth cookie like the edge function.
// Requires Node 18+. Configuration via environment variables or a .env file.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import YAML from "yaml";
import { COOKIE_NAME, roleFromCookieValue } from "./netlify/shared/token.mjs";
import { requireAdmin } from "./netlify/functions/_auth.mjs";
import { contentHash } from "./netlify/shared/content-hash.mjs";

const root = process.cwd();

// Minimal .env loader (no dependency; existing env wins)
const envFile = path.join(root, ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const PORT = Number(process.env.PORT || 8888);

// --- Local write mode -------------------------------------------------------
// When this standalone server runs WITHOUT GitHub credentials, "Sync" writes
// directly into the working directory, validates via the build, and can
// optionally create local Git commits (LOCAL_GIT=1). Never active on hosted
// platforms: their serverless runtimes execute netlify/functions/* directly,
// and as belt and braces we refuse local mode when a platform env is present.
const HOSTED = Boolean(
  process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.VERCEL || process.env.DENO_DEPLOYMENT_ID || process.env.CF_PAGES
);
const LOCAL_MODE = !HOSTED && process.env.LOCAL_WRITE !== "0" &&
  (!process.env.GITHUB_TOKEN || process.env.LOCAL_WRITE === "1");
const LOCAL_GIT = LOCAL_MODE && process.env.LOCAL_GIT === "1";

const jsonResponse = (obj, status = 200) => Response.json(obj, { status });

function runBuild() {
  return spawnSync("npm", ["run", "build"], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
}

function gitCommit(message) {
  if (!LOCAL_GIT) return { commit: null };
  const add = spawnSync("git", ["add", "-A", "--", "data/trees", "public/sources", "public/photos", "public/chronicle"], { cwd: root, encoding: "utf8" });
  const commit = spawnSync("git", ["commit", "-m", message], { cwd: root, encoding: "utf8" });
  if (add.status !== 0 || commit.status !== 0) {
    return { commit: null, gitWarning: (commit.stderr || commit.stdout || add.stderr || "git commit failed").trim().slice(0, 300) };
  }
  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  return { commit: (sha.stdout || "").trim() || null };
}

const LOCAL_FNS = {
  "save-family": async (request) => {
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON." }, 400); }
    const data = body?.data;
    if (!data || typeof data !== "object" || !data.people || typeof data.people !== "object") {
      return jsonResponse({ error: "Invalid family tree data." }, 400);
    }
    const tree = String(body?.tree || "family");
    if (!/^[a-z0-9_-]+$/.test(tree)) return jsonResponse({ error: "Invalid dataset name." }, 400);
    const filePath = path.join(root, "data", "trees", `${tree}.yaml`);
    const exists = fs.existsSync(filePath);
    if (!exists && !body?.create) return jsonResponse({ error: `Dataset '${tree}' does not exist.` }, 400);
    if (exists && body?.create) return jsonResponse({ error: `Dataset '${tree}' already exists.` }, 409);
    const backup = exists ? fs.readFileSync(filePath, "utf8") : null;
    const baseHash = typeof body?.baseHash === "string" && body.baseHash ? body.baseHash : null;
    if (baseHash && backup !== null && baseHash !== contentHash(backup)) {
      return jsonResponse({ error: "The central dataset has changed since your draft started – nothing was saved. Reload to review the current state, then redo your changes or discard the draft." }, 409);
    }
    fs.writeFileSync(filePath, YAML.stringify(data, { lineWidth: 0 }), "utf8");
    const build = runBuild();
    if (build.status !== 0) {
      // restore the previous valid state, rebuild, report the validation output
      if (backup === null) fs.unlinkSync(filePath); else fs.writeFileSync(filePath, backup, "utf8");
      runBuild();
      const output = `${build.stdout || ""}\n${build.stderr || ""}`.trim().split("\n").slice(-12).join("\n");
      return jsonResponse({ error: `Validation failed – nothing was saved:\n${output}` }, 422);
    }
    const git = gitCommit(`Update dataset ${tree} (local)`);
    return jsonResponse({ ok: true, mode: "local", contentHash: contentHash(YAML.stringify(data, { lineWidth: 0 })), ...git });
  },
  "upload-source": async (request) => {
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON." }, 400); }
    const filename = String(body?.filename || "");
    const kind = body?.kind === "photo" ? "photo" : body?.kind === "chronicle" ? "chronicle" : "source";
    const tree = String(body?.tree || "");
    if (kind === "chronicle" && !/^[a-z0-9_-]+$/.test(tree)) return jsonResponse({ error: "Invalid tree." }, 400);
    const dir = kind === "photo" ? "photos" : kind === "chronicle" ? path.join("chronicle", tree) : "sources";
    if (!/^[a-zA-Z0-9._-]+\.(pdf|png|jpe?g|md|ya?ml)$/i.test(filename)) return jsonResponse({ error: "Invalid filename." }, 400);
    if (kind === "photo" && !/\.(png|jpe?g)$/i.test(filename)) return jsonResponse({ error: "Only PNG or JPG allowed for photos." }, 400);
    if (kind === "chronicle" && !/\.(md|ya?ml)$/i.test(filename)) return jsonResponse({ error: "Only Markdown or YAML allowed for the chronicle." }, 400);
    const contentBase64 = String(body?.contentBase64 || "");
    if (!contentBase64 || contentBase64.length > 6 * 1024 * 1024) return jsonResponse({ error: "File too large (max. ~4 MB)." }, 413);
    fs.mkdirSync(path.join(root, "public", dir), { recursive: true });
    fs.writeFileSync(path.join(root, "public", dir, filename), Buffer.from(contentBase64, "base64"));
    const git = gitCommit(`Upload ${kind}: ${filename}`);
    return jsonResponse({ ok: true, filename, mode: "local", ...git });
  },
  "delete-source": async (request) => {
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ error: "Invalid JSON." }, 400); }
    const filename = String(body?.filename || "");
    const kind = body?.kind === "photo" ? "photo" : body?.kind === "chronicle" ? "chronicle" : "source";
    const tree = String(body?.tree || "");
    if (kind === "chronicle" && !/^[a-z0-9_-]+$/.test(tree)) return jsonResponse({ error: "Invalid tree." }, 400);
    const dir = kind === "photo" ? "photos" : kind === "chronicle" ? path.join("chronicle", tree) : "sources";
    if (!/^[a-zA-Z0-9._-]+\.(pdf|png|jpe?g|md|ya?ml)$/i.test(filename)) return jsonResponse({ error: "Invalid filename." }, 400);
    const filePath = path.join(root, "public", dir, filename);
    if (!fs.existsSync(filePath)) return jsonResponse({ error: "File not found." }, 404);
    fs.unlinkSync(filePath);
    const git = gitCommit(`Delete ${kind}: ${filename}`);
    return jsonResponse({ ok: true, mode: "local", ...git });
  }
};
// ---------------------------------------------------------------------------
const FUNCTIONS_DIR = path.join(root, "netlify", "functions");
const PUBLIC_DIR = path.join(root, "public");

const handlers = {};
for (const file of fs.readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith(".mjs") && !f.startsWith("_"))) {
  handlers[file.replace(/\.mjs$/, "")] = (await import(path.join(FUNCTIONS_DIR, file))).default;
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".yaml": "text/yaml; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".pdf": "application/pdf", ".ico": "image/x-icon"
};

async function toRequest(req) {
  const url = `http://${req.headers.host || "localhost"}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  let body = null;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = Buffer.concat(chunks);
  }
  return new Request(url, { method: req.method, headers, body });
}

async function send(res, response) {
  const headers = {};
  response.headers.forEach((v, k) => { if (k !== "set-cookie") headers[k] = v; });
  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) headers["set-cookie"] = cookies;
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function sessionRole(req) {
  const adminPassword = process.env.FAMILY_TREE_PASSWORD;
  if (!adminPassword) return null;
  const cookies = String(req.headers.cookie || "");
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match ? roleFromCookieValue(adminPassword, match[1]) : null;
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);

    // Serverless handlers
    const fnMatch = pathname.match(/^\/\.netlify\/functions\/([a-z0-9-]+)$/);
    if (fnMatch) {
      const name = fnMatch[1];
      if (!["login", "logout"].includes(name) && !(await sessionRole(req))) {
        res.writeHead(403); return res.end("Not signed in");
      }
      if (LOCAL_MODE && LOCAL_FNS[name]) {
        return send(res, await LOCAL_FNS[name](await toRequest(req)));
      }
      const handler = handlers[name];
      if (!handler) { res.writeHead(404); return res.end("Unknown function"); }
      return send(res, await handler(await toRequest(req)));
    }

    // Auth gate (mirrors the edge function)
    if (pathname !== "/login.html") {
      if (!process.env.FAMILY_TREE_PASSWORD) {
        res.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
        return res.end("FAMILY_TREE_PASSWORD is not set (environment or .env file).");
      }
      if (!(await sessionRole(req))) {
        res.writeHead(302, { location: "/login.html" });
        return res.end();
      }
    }

    // Static files from public/
    let filePath = path.normalize(path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname));
    if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    res.writeHead(200, {
      "content-type": TYPES[path.extname(filePath)] || "application/octet-stream",
      "cache-control": pathname.startsWith("/data/") ? "no-store" : "no-cache"
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("Internal error");
  }
});

server.listen(PORT, () => {
  console.log(`stammgit running at http://localhost:${PORT}`);
  if (!process.env.FAMILY_TREE_PASSWORD) console.log("Warning: FAMILY_TREE_PASSWORD is not set – copy .env.example to .env first.");
  if (LOCAL_MODE) {
    console.log(`Local write mode: Sync writes to the working directory and validates via the build${LOCAL_GIT ? ", then commits locally (LOCAL_GIT=1)" : " (set LOCAL_GIT=1 for automatic local commits)"}.`);
  } else if (!process.env.GITHUB_TOKEN) {
    console.log("Note: without GITHUB_TOKEN/GITHUB_REPO, sync and uploads are disabled.");
  } else {
    console.log("GitHub mode: Sync commits via the GitHub API.");
  }
});
