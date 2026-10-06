import { COOKIE_NAME, ROLE_COOKIE, sessionForPassword } from "../shared/token.mjs";

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const adminPassword = process.env.FAMILY_TREE_PASSWORD;
  if (!adminPassword) {
    return new Response("FAMILY_TREE_PASSWORD is not set.", { status: 503 });
  }

  const form = await request.formData();
  const supplied = String(form.get("password") || "");

  let authenticated;
  try {
    authenticated = await sessionForPassword(adminPassword, supplied,
      process.env.FAMILY_TREE_READERS, process.env.FAMILY_TREE_USER_PASSWORD);
  } catch {
    return new Response("Invalid reader configuration.", { status: 503, headers: { "cache-control": "no-store" } });
  }
  if (!authenticated) {
    return Response.redirect(new URL("/login.html?error=1", request.url), 303);
  }
  const { role, token } = authenticated;

  // Secure only over https: Safari drops Secure cookies on http://localhost,
  // which would loop the login endlessly when using server.mjs locally.
  const isHttps = new URL(request.url).protocol === "https:" ||
    String(request.headers.get("x-forwarded-proto") || "").includes("https");
  const secure = isHttps ? ["Secure"] : [];
  const session = [
    `${COOKIE_NAME}=${token}`,
    "Path=/", "HttpOnly", ...secure, "SameSite=Strict", "Max-Age=2592000"
  ].join("; ");
  const roleCookie = [
    `${ROLE_COOKIE}=${role}`,
    "Path=/", ...secure, "SameSite=Strict", "Max-Age=2592000"
  ].join("; ");

  const target = new URL(String(form.get('next') || '/'), request.url);
  const next = target.origin === new URL(request.url).origin && target.pathname === '/' ? target.pathname + target.search + target.hash : '/';
  const headers = new Headers({ location: next, "cache-control": "no-store" });
  headers.append("set-cookie", session);
  headers.append("set-cookie", roleCookie);
  return new Response(null, { status: 303, headers });
};
