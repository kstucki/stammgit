import crypto from "node:crypto";
import { COOKIE_NAME, ROLE_COOKIE, tokenFor } from "./_auth.mjs";

function timingEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const adminPassword = process.env.FAMILY_TREE_PASSWORD;
  if (!adminPassword) {
    return new Response("FAMILY_TREE_PASSWORD is not set.", { status: 503 });
  }
  const userPassword = process.env.FAMILY_TREE_USER_PASSWORD || "";

  const form = await request.formData();
  const supplied = String(form.get("password") || "");

  let role = null;
  if (timingEqual(supplied, adminPassword)) role = "admin";
  else if (userPassword && timingEqual(supplied, userPassword)) role = "user";

  if (!role) {
    return Response.redirect(new URL("/login.html?error=1", request.url), 303);
  }

  // Secure only over https: Safari drops Secure cookies on http://localhost,
  // which would loop the login endlessly when using server.mjs locally.
  const isHttps = new URL(request.url).protocol === "https:" ||
    String(request.headers.get("x-forwarded-proto") || "").includes("https");
  const secure = isHttps ? ["Secure"] : [];
  const session = [
    `${COOKIE_NAME}=${await tokenFor(adminPassword, role)}`,
    "Path=/", "HttpOnly", ...secure, "SameSite=Strict", "Max-Age=2592000"
  ].join("; ");
  const roleCookie = [
    `${ROLE_COOKIE}=${role}`,
    "Path=/", ...secure, "SameSite=Strict", "Max-Age=2592000"
  ].join("; ");

  const headers = new Headers({ location: "/", "cache-control": "no-store" });
  headers.append("set-cookie", session);
  headers.append("set-cookie", roleCookie);
  return new Response(null, { status: 303, headers });
};
