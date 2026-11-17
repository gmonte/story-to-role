export type LineChange = { type: "same" | "added" | "removed"; text: string };

/**
 * The lines that differ between two versions of the profile, in order
 * (a longest-common-subsequence diff; profiles are a few hundred lines).
 */
export function diffLines(before: string, after: string): LineChange[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const lengths = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i][j] =
        a[i] === b[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }
  const changes: LineChange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      changes.push({ type: "same", text: a[i] });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      changes.push({ type: "removed", text: a[i++] });
    } else {
      changes.push({ type: "added", text: b[j++] });
    }
  }
  while (i < a.length) changes.push({ type: "removed", text: a[i++] });
  while (j < b.length) changes.push({ type: "added", text: b[j++] });
  return changes;
}
