import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { sameAdditions } from "@repo/api/domains/profile/suggestions/propose-suggestion";
import { findMarks } from "@repo/api/domains/profile/truth/marks";
import { ungivenFigures } from "@repo/api/domains/profile/truth/suggestions";
import type { DbClient } from "@repo/api/tools/db-client";
import { findQuote } from "@repo/api/utils/text/verify-quote";

import { DocumentsRepository } from "../documents-repository";
import { writtenLines } from "../generation/resume-checks";
import {
  documentChangeContentSchema,
  type DocumentChange,
  type DocumentChangeContent,
  type DocumentChangeOrigin,
} from "../schemas/document-change";
import {
  changeViolation,
  isLockedPart,
  listDocumentParts,
  locateDocumentChange,
  normalizeDocumentChange,
  rangesOverlap,
  splitChangeLines,
  type ChangeableContent,
  type DocumentChange as ProposedChange,
} from "./document-change";

export function readChangeContent(
  cipher: UserCipher,
  row: { encryptedContent: string }
): DocumentChangeContent {
  return documentChangeContentSchema.parse(
    JSON.parse(cipher.decrypt(row.encryptedContent))
  );
}

export type ChangeRefusal =
  | { kind: "empty" }
  | { kind: "locked" }
  | { kind: "noSuchPart" }
  | { kind: "notFound" }
  | { kind: "unchanged" }
  | { kind: "fixedLines" }
  | { kind: "ungivenFigures"; figures: string[] };

/**
 * A quoted profile line as the evidence holds it: without its list
 * marker and its figure marks (`[measured: …]`), which generation strips.
 */
function plainPassage(passage: string) {
  let text = passage.trim().replace(/^[-•*]\s+/, "");
  for (const mark of [...findMarks(text)].reverse()) {
    text = `${text.slice(0, mark.from)} ${text.slice(mark.to)}`;
  }
  return text
    .replace(/\s+([.,;])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * The evidence rows a change rests on: the profile passages the agent
 * quoted, found in the frozen version's lines (whitespace, case and the
 * figure marks may differ; wording may not). Passages found nowhere are
 * returned, for the agent to quote them right or drop them.
 */
export function resolvePassages(
  passages: string[],
  evidence: Array<{ id: string; text: string }>
) {
  const evidenceIds = new Set<string>();
  const unmatched: string[] = [];
  for (const passage of passages) {
    const quote = plainPassage(passage);
    if (!quote) continue;
    const found = evidence.filter(
      (row) =>
        findQuote(row.text, quote) !== null ||
        findQuote(quote, row.text) !== null
    );
    if (!found.length) unmatched.push(quote);
    for (const row of found) evidenceIds.add(row.id);
  }
  return { evidenceIds: [...evidenceIds], unmatched };
}

/**
 * Proposes a change to a document version as a pending suggestion (ADR
 * 0009): nothing reaches the document until the user accepts it. Refused
 * when it names a locked part, doesn't apply to the content as it is,
 * changes nothing, changes a fixed part's line count, or writes a figure
 * found neither in the frozen profile version, nor in the document, nor
 * in `sources` (the person's own words): the agent never supplies a
 * number nobody gave. A pending change whose lines the new one rewrites
 * is superseded by it.
 */
export async function proposeChange(input: {
  db: DbClient;
  cipher: UserCipher;
  versionId: string;
  snapshotId: string;
  content: ChangeableContent;
  origin: DocumentChangeOrigin;
  change: ProposedChange;
  reason: string;
  // The profile passages the agent says the change rests on.
  profilePassages?: string[];
  // The frozen profile version's lines, by id.
  evidence: Array<{ id: string; text: string }>;
  // The frozen profile version's text: figures may come from it.
  profileText: string | null;
  sources: string[];
  // The changes already waiting: two can't rewrite the same lines, so the
  // new one takes the place of those it overlaps.
  pending?: Array<DocumentChangeContent & { id: string }>;
}): Promise<
  | {
      ok: true;
      change: DocumentChange;
      supersededIds: string[];
      unmatchedPassages: string[];
    }
  | { ok: false; refusal: ChangeRefusal }
> {
  const refuse = (refusal: ChangeRefusal) => ({
    ok: false as const,
    refusal,
  });
  const key = input.change.part.trim();
  if (isLockedPart(key)) return refuse({ kind: "locked" });
  if (!listDocumentParts(input.content).some((part) => part.key === key)) {
    return refuse({ kind: "noSuchPart" });
  }
  const proposed = { ...input.change, part: key };
  if (
    !splitChangeLines(proposed.find).length &&
    !splitChangeLines(proposed.replace).length
  ) {
    return refuse({ kind: "empty" });
  }
  const change = normalizeDocumentChange(input.content, proposed);
  if (!change) return refuse({ kind: "notFound" });
  if (change.find === change.replace) return refuse({ kind: "unchanged" });
  const violation = changeViolation(input.content, change);
  if (violation) return refuse({ kind: violation });

  const located = locateDocumentChange(input.content, change)!;
  const supersededIds = (input.pending ?? [])
    .filter((other) => {
      if (other.part !== change.part) return false;
      const taken = locateDocumentChange(input.content, other);
      return taken !== null && rangesOverlap(located, taken);
    })
    .map((other) => other.id)
    .concat(
      sameAdditions(
        (input.pending ?? []).filter((other) => other.part === change.part),
        change
      )
    );
  const figures = ungivenFigures(change.replace, [
    input.profileText ?? "",
    ...writtenLines(input.content).map((line) => line.text),
    ...input.sources,
  ]);
  if (figures.length) return refuse({ kind: "ungivenFigures", figures });

  const { evidenceIds, unmatched } = resolvePassages(
    input.profilePassages ?? [],
    input.evidence
  );
  const content: DocumentChangeContent = {
    ...change,
    reason: input.reason.trim(),
    evidenceIds,
  };
  const row = await input.db.transaction(async (tx) => {
    const repository = new DocumentsRepository(tx);
    await repository.resolveChanges({
      versionId: input.versionId,
      resolution: "superseded",
      documentChangeIds: [...new Set(supersededIds)],
    });
    return repository.insertChange({
      versionId: input.versionId,
      snapshotId: input.snapshotId,
      origin: input.origin,
      encryptedContent: input.cipher.encrypt(JSON.stringify(content)),
    });
  });
  return {
    ok: true,
    supersededIds: [...new Set(supersededIds)],
    unmatchedPassages: unmatched,
    change: {
      id: row.id,
      versionId: row.versionId,
      origin: row.origin,
      createdAt: row.createdAt,
      ...content,
    },
  };
}
