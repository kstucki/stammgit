export default async (request) => {
  const isHttps = new URL(request.url).protocol === "https:" ||
    String(request.headers.get("x-forwarded-proto") || "").includes("https");
  const secure = isHttps ? " Secure;" : "";
  const headers = new Headers({
    location: "/login.html",
    "cache-control": "no-store"
  });
  headers.append("set-cookie", `family_tree_session=; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=0`);
  headers.append("set-cookie", `family_tree_role=; Path=/;${secure} SameSite=Strict; Max-Age=0`);
  return new Response(null, { status: 303, headers });
};
