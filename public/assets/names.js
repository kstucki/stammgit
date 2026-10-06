// Splits a stored full name into the parts GEDCOM needs. Stored names follow
// Swiss usage: an alliance name «Sample-Smith» puts the husband's family
// name first and the wife's birth name second; men write their own name first.
const PARTICLES = new Set(["von", "van", "de", "da", "di", "du", "della", "v.", "vom", "zum", "zur", "la", "le", "dos", "das", "do", "des"]);
const SUFFIX = /\s+((?:der|die)\s+(?:Jüngere|Ältere)|I{1,3}|IV|VI?)$/;

export function nameParts(full = "") {
  let rest = String(full).replace(/\s+/g, " ").trim();
  const born = /\s*\((?:geb\.|geborene|née)\s*([^)]+)\)\s*$/i.exec(rest);
  if (born) rest = rest.slice(0, born.index).trim();
  let suffix = "";
  const trailing = /\s+(\([^)]*\))$/.exec(rest);
  if (trailing) { suffix = trailing[1]; rest = rest.slice(0, trailing.index).trim(); }
  const epithet = SUFFIX.exec(rest);
  if (epithet) { suffix = [epithet[1], suffix].filter(Boolean).join(" "); rest = rest.slice(0, epithet.index).trim(); }
  const tokens = rest.split(" ");
  if (tokens.length < 2) return { given: rest, surname: "", suffix, bornAs: born?.[1] || "" };
  let i = tokens.length - 1;
  while (i > 1 && PARTICLES.has(tokens[i - 1].toLowerCase())) i--;
  if (i > 1 && /-(von|van|de|vom|zum|la|le)$/i.test(tokens[i - 1])) i--;
  if (i > 1 && ["vom", "zum"].includes(tokens[i].toLowerCase())) i--; // multiword branch names, e.g. «Example vom Hof»
  return { given: tokens.slice(0, i).join(" "), surname: tokens.slice(i).join(" "), suffix, bornAs: born?.[1] || "" };
}
