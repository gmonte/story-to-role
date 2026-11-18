export type PublicName = { original: string; public: string };

const arrow = /\s*(?:→|->|=>)\s*/;

/**
 * Reads the value of a “Public names” line: entries split on `;` only
 * (a name may hold commas), each `original → public form` (`→`, `->` or
 * `=>`). An entry missing a side is returned apart, for the linter.
 */
export function parsePublicNames(value: string) {
  const entries: PublicName[] = [];
  const malformed: string[] = [];
  for (const raw of value.split(";")) {
    const item = raw.trim().replace(/\.$/, "").trim();
    if (!item) continue;
    const [original = "", ...rest] = item.split(arrow);
    const publicForm = rest.join(" → ").trim();
    if (original.trim() && publicForm) {
      entries.push({ original: original.trim(), public: publicForm });
    } else {
      malformed.push(item);
    }
  }
  return { entries, malformed };
}

export const publicNamesLabels = ["nomes publicos", "public names"];
