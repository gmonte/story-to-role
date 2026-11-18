/**
 * Coverage findings that warn without blocking: the document can still
 * leave once the user confirms. Kept free of imports so the interface can
 * read it too.
 */
export const warningFindingCodes: readonly string[] = ["publicName"];

export const isWarningFinding = (finding: { code: string }) =>
  warningFindingCodes.includes(finding.code);
