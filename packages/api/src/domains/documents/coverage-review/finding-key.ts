import { sha256Hex } from "@repo/api/domains/profile/truth/finding-key";

type FindingLike = {
  code: string;
  text: string;
  params: Record<string, string | number>;
};

/**
 * The key an ignored document finding is stored under, in the version's
 * `dismissedFindings` (resume spec, "Document workspace": Ignore, as in the
 * profile): the code, the text it covers and its params, so the same
 * finding on the same words stays ignored and a change to them brings it
 * back. Shared by the browser and the server.
 */
export function coverageFindingKey(finding: FindingLike) {
  return sha256Hex(
    `${finding.code} | span: ${finding.text.trim()} | ${JSON.stringify(finding.params)}`
  ).slice(0, 16);
}

/** A note of the AI review the user ignored: its kind, line and words. */
export function reviewNoteKey(note: {
  kind: string;
  lineText: string | null;
  text: string;
}) {
  return sha256Hex(
    `review | ${note.kind} | ${note.lineText ?? ""} | ${note.text}`
  ).slice(0, 16);
}

/**
 * The findings that still count once the ignored ones are left out. Every
 * finding may be ignored: none blocks the document (resume spec, "Document
 * workspace").
 */
export function withoutDismissedFindings<T extends FindingLike>(
  findings: T[],
  dismissed: readonly string[]
) {
  const hidden = new Set(dismissed);
  return findings.filter((finding) => !hidden.has(coverageFindingKey(finding)));
}
