import { normalizeLabel, presentWords } from "./sections";

const months: Record<string, number> = {
  jan: 1,
  janeiro: 1,
  january: 1,
  fev: 2,
  fevereiro: 2,
  feb: 2,
  february: 2,
  mar: 3,
  marco: 3,
  march: 3,
  abr: 4,
  abril: 4,
  apr: 4,
  april: 4,
  mai: 5,
  maio: 5,
  may: 5,
  jun: 6,
  junho: 6,
  june: 6,
  jul: 7,
  julho: 7,
  july: 7,
  ago: 8,
  agosto: 8,
  aug: 8,
  august: 8,
  set: 9,
  setembro: 9,
  sep: 9,
  sept: 9,
  september: 9,
  out: 10,
  outubro: 10,
  oct: 10,
  october: 10,
  nov: 11,
  novembro: 11,
  november: 11,
  dez: 12,
  dezembro: 12,
  dec: 12,
  december: 12,
};

export const canonicalMonth = /^\d{4}-(0[1-9]|1[0-2])$/;

function format(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * A month written any common way ("2021-01", "01/2021", "Jan/2021",
 * "janeiro de 2021", "Jan 2021") as `YYYY-MM`; null when there is no month
 * to be sure of (a year alone, a placeholder).
 */
export function readMonth(text: string): string | null {
  const value = normalizeLabel(text).replace(/\.$/, "");
  let match = /^(\d{4})[-/.](\d{1,2})$/.exec(value);
  if (match) return validMonth(Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})[-/.](\d{4})$/.exec(value);
  if (match) return validMonth(Number(match[2]), Number(match[1]));
  match = /^([a-z]+)\.?(?:\s+de\s+|\s*[/\-. ]\s*)(\d{4})$/.exec(value);
  if (match && months[match[1]]) {
    return format(Number(match[2]), months[match[1]]);
  }
  return null;
}

function validMonth(year: number, month: number) {
  return month >= 1 && month <= 12 && year >= 1900 ? format(year, month) : null;
}

export function isPresent(text: string) {
  return presentWords.includes(normalizeLabel(text));
}

// `end` is a month, or "present" for the current position.
export type DateRange = { start: string; end: string };

/**
 * "2021-01 a 2023-03", "Jan/2021 - present", "01/2021 – atual": the two
 * ends of a period, or null when either isn't a month (or "present").
 */
export function readRange(text: string): DateRange | null {
  const parts = text
    .trim()
    .split(/\s+(?:a|to|ate|até|until)\s+|\s*[–—]\s*|\s+-\s+/i);
  if (parts.length !== 2) return null;
  const start = readMonth(parts[0]);
  if (!start) return null;
  if (isPresent(parts[1])) return { start, end: "present" };
  const end = readMonth(parts[1]);
  return end ? { start, end } : null;
}
