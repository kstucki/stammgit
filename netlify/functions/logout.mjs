export default async () => {
  const headers = new Headers({
    location: "/login.html",
    "cache-control": "no-store"
  });
  headers.append("set-cookie", "family_tree_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0");
  headers.append("set-cookie", "family_tree_role=; Path=/; Secure; SameSite=Strict; Max-Age=0");
  return new Response(null, { status: 303, headers });
};
