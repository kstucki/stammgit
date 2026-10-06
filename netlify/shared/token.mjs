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

/** @param {string | null | undefined} [raw] */
export async function roleFromCookieValue(adminPassword, value, raw = undefined, legacyPassword = "") {
  if (!adminPassword || !value) return null;
  if (equalSecret(value, await tokenFor(adminPassword, "admin"))) return "admin";
  const match = /^reader-v3\.([a-zA-Z0-9_-]{1,64})\.([a-f0-9]{64})$/.exec(value);
  if (!match) return null; // Shared v2 reader cookies are deliberately invalidated.
  let readers;
  try { readers = readersFromConfig(adminPassword, raw, legacyPassword); } catch { return null; }
  const reader = readers.find(([id]) => id === match[1]);
  if (!reader) return null;
  return equalSecret(value, await readerTokenFor(adminPassword, ...reader)) ? "user" : null;
}

// An explicitly configured JSON object supersedes the legacy reader password.
// Invalid configuration never silently restores a removed legacy access.
export function readersFromConfig(adminPassword, raw, legacyPassword = "") {
  if (raw === undefined || raw === null) {
    if (!legacyPassword) return [];
    if (legacyPassword === adminPassword) throw new Error("Invalid reader configuration.");
    return [["legacy", legacyPassword]];
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error("Invalid reader configuration."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid reader configuration.");
  const entries = Object.entries(value), passwords = new Set();
  for (const [id, password] of entries) {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id) || typeof password !== "string" || !password.trim() || password === adminPassword || passwords.has(password)) {
      throw new Error("Invalid reader configuration.");
    }
    passwords.add(password);
  }
  return entries;
}

export function equalSecret(a, b) {
  const left = enc.encode(a), right = enc.encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function readerTokenFor(adminPassword, id, password) {
  return `reader-v3.${id}.${await hmacHex(adminPassword, JSON.stringify(["familienstammbaum-reader-v3", id, password]))}`;
}

/** @param {string | null | undefined} [raw] */
export async function sessionForPassword(adminPassword, supplied, raw = undefined, legacyPassword = "") {
  if (!adminPassword) return null;
  // A malformed reader list must not lock the administrator out.
  if (equalSecret(supplied, adminPassword)) return { role: "admin", token: await tokenFor(adminPassword, "admin") };
  const readers = readersFromConfig(adminPassword, raw, legacyPassword);
  for (const [id, password] of readers) {
    if (equalSecret(supplied, password)) return { role: "user", token: await readerTokenFor(adminPassword, id, password) };
  }
  return null;
}
