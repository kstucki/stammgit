// Runtime-neutral session token logic (WebCrypto only).
// Shared by the Deno edge function and the Node functions so the
// login and the auth gate can never diverge.
export const COOKIE_NAME = "family_tree_session";
export const ROLE_COOKIE = "family_tree_role";
export const ROLES = ["admin", "user"];

const enc = new TextEncoder();

async function hmacHex(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function tokenFor(adminPassword, role) {
  return `${role}.${await hmacHex(adminPassword, `familienstammbaum-session-v2:${role}`)}`;
}

export async function roleFromCookieValue(adminPassword, value) {
  if (!value) return null;
  for (const role of ROLES) {
    if (value === await tokenFor(adminPassword, role)) return role;
  }
  return null;
}
