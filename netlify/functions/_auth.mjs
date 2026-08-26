// Role check for Node functions – token logic lives in ../shared/token.mjs.
import { COOKIE_NAME, ROLE_COOKIE, tokenFor, roleFromCookieValue } from "../shared/token.mjs";

export { COOKIE_NAME, ROLE_COOKIE, tokenFor };

export async function roleFromRequest(request) {
  const adminPassword = process.env.FAMILY_TREE_PASSWORD;
  if (!adminPassword) return null;
  const cookies = String(request.headers.get("cookie") || "");
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return roleFromCookieValue(adminPassword, match[1]);
}

export async function requireAdmin(request) {
  if ((await roleFromRequest(request)) === "admin") return null;
  return Response.json({ error: "Admin sign-in required." }, { status: 403 });
}
