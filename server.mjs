// Standalone server: runs stammgit without Netlify.
//   npm run build && node server.mjs   →  http://localhost:8888
// Serves public/, mounts the same serverless handlers under
// /.netlify/functions/* and enforces the auth cookie like the edge function.
// Requires Node 18+. Configuration via environment variables or a .env file.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { COOKIE_NAME, roleFromCookieValue } from "./netlify/shared/token.mjs";

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
      const handler = handlers[fnMatch[1]];
      if (!handler) { res.writeHead(404); return res.end("Unknown function"); }
      if (!["login", "logout"].includes(fnMatch[1]) && !(await sessionRole(req))) {
        res.writeHead(403); return res.end("Not signed in");
      }
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
  if (!process.env.GITHUB_TOKEN) console.log("Note: without GITHUB_TOKEN/GITHUB_REPO, sync and uploads are disabled (read/edit drafts still work).");
});
