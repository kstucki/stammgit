// Auth edge function – token logic shared with the Node functions.
import { COOKIE_NAME, roleFromCookieValue } from "../shared/token.mjs";

export default async (request, context) => {
  const url = new URL(request.url);

  if (
    url.pathname === "/login.html" ||
    url.pathname === "/.netlify/functions/login" ||
    url.pathname === "/.netlify/functions/logout"
  ) {
    return;
  }

  const adminPassword = Netlify.env.get("FAMILY_TREE_PASSWORD");
  if (!adminPassword) {
    return new Response(
      "FAMILY_TREE_PASSWORD is not set in Netlify.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } }
    );
  }

  const token = context.cookies.get(COOKIE_NAME);
  const role = await roleFromCookieValue(adminPassword, token,
    Netlify.env.get("FAMILY_TREE_READERS"), Netlify.env.get("FAMILY_TREE_USER_PASSWORD"));

  if (!role) {
    return Response.redirect(new URL(`/login.html?next=${encodeURIComponent(url.pathname + url.search)}`, request.url), 302);
  }

};
