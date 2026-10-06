// Personal websites and profiles are kept separate from evidence citations.
export function isWebUrl(value) {
  if (typeof value !== "string" || !/^https?:\/\//i.test(value) || /\s/.test(value)) return false;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !!url.hostname; }
  catch { return false; }
}
export function validWebLinks(value) {
  return Array.isArray(value) && value.every(link => link && typeof link === "object" && !Array.isArray(link)
    && isWebUrl(link.url) && (link.label === undefined || typeof link.label === "string"));
}
