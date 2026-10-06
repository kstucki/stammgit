// One date grammar for data, editor, validation and GEDCOM. Every stored date
// (birth, death, partner start/end) is one of:
//   exact      YYYY · YYYY-MM · YYYY-MM-DD (ISO, calendar-checked)
//   about      «um YYYY»       before «vor YYYY»       after «nach YYYY»
//   either     «YYYY od. YYYY» (one of two years)
//   uncertain  «YYYY ?»        (year not confirmed)
import { dateRange } from "./relationships.js";

const QUALIFIER = { um: "about", vor: "before", nach: "after" };

export function parseDate(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (dateRange(v)) {
    const [year, month, day] = v.split("-").map(Number);
    return { type: "exact", year, month, day };
  }
  let m = /^(um|vor|nach) (\d{4})$/.exec(v);
  if (m) return { type: QUALIFIER[m[1]], year: Number(m[2]) };
  m = /^(\d{4}) od\. (\d{4})$/.exec(v);
  if (m && Number(m[1]) < Number(m[2])) return { type: "either", year: Number(m[1]), year2: Number(m[2]) };
  m = /^(\d{4}) \?$/.exec(v);
  if (m) return { type: "uncertain", year: Number(m[1]) };
  return null;
}

export const isValidDate = value => parseDate(value) !== null;

// Lenient input as typed in the editor or found in imports, mapped onto the grammar.
// Unknown input is returned trimmed and unchanged so validation can name it.
export function normalizeDate(input) {
  const v = String(input ?? "").trim().replace(/\s+/g, " ");
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = /^(\d{1,2})\.(\d{4})$/.exec(v);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = /^(?:ca\.?|circa|~|um|etwa|cerca de|aprox\.?)\s*(\d{4})$/i.exec(v);
  if (m) return `um ${m[1]}`;
  m = /^(?:vor|before|antes de)\s*(\d{4})$/i.exec(v);
  if (m) return `vor ${m[1]}`;
  m = /^(?:nach|after|depois de)\s*(\d{4})$/i.exec(v);
  if (m) return `nach ${m[1]}`;
  m = /^(\d{4})\s*(?:od\.?|oder|or|ou|\/)\s*(\d{4})$/i.exec(v);
  if (m) return `${m[1]} od. ${m[2]}`;
  m = /^(\d{4})\s*\?$/.exec(v);
  if (m) return `${m[1]} ?`;
  return v;
}

export const firstYear = value => parseDate(value)?.year ?? null;

// Persons born before this year are treated as deceased when no death date is known.
export const LIVING_CUTOFF_YEAR = 1920;
export function defaultLiving(person) {
  if (person?.death) return false;
  const year = firstYear(person?.birth);
  return !(year !== null && year < LIVING_CUTOFF_YEAR);
}
