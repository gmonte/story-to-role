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
  isLockedFactPart,
  isLockedPart,
  listDocumentParts,
  locateDocumentChange,
  normalizeDocumentChange,
  rangesOverlap,
  splitChangeLines,
  type ChangeableContent,
  type DocumentChange as ProposedChange,
} from "./document-change";
import { userRequested, type UserRequest } from "./requested-change";
import {
  applySectionMove,
  sectionMovePart,
  sectionMoveText,
  type SectionMove,
} from "./section-order";

const sameLines = (a: string[], b: string[]) =>
  a.length === b.length &&
  [...a].sort().join("\n") === [...b].sort().join("\n");

/**
 * Moving or swapping lines is one change. When the new change and a
 * change of the same turn waiting in the same part touch adjacent lines
 * and, together, only put those lines in another order, the two become
 * one change over all the lines, in the new order (the older one is then
 * superseded, as it overlaps). Otherwise null: the two stay apart.
 */
function mergeReorder(
  content: ChangeableContent,
  change: ProposedChange,
  input: {
    pending?: Array<DocumentChangeContent & { id: string }>;
    sameTurnIds?: ReadonlySet<string>;
  }
): ProposedChange | null {
  const mine = locateDocumentChange(content, change);
  if (!mine || mine.end === mine.start || !input.sameTurnIds?.size) return null;
  for (const other of input.pending ?? []) {
    if (other.part !== change.part || !input.sameTurnIds.has(other.id))
      continue;
    const theirs = locateDocumentChange(content, other);
    if (!theirs || theirs.end === theirs.start) continue;
    const [first, second] =
      theirs.end === mine.start
        ? [
            { range: theirs, replace: other.replace },
            { range: mine, replace: change.replace },
          ]
        : mine.end === theirs.start
          ? [
              { range: mine, replace: change.replace },
              { range: theirs, replace: other.replace },
            ]
          : [];
    if (!first || !second) continue;
    const lines = mine.part.lines
      .slice(first.range.start, second.range.end)
      .map((line) => line.text);
    const written = [
      ...splitChangeLines(first.replace),
      ...splitChangeLines(second.replace),
    ];
    if (!sameLines(lines, written)) continue;
    const merged = {
      part: change.part,
      find: lines.join("\n"),
      replace: written.join("\n"),
    };
    if (merged.find === merged.replace || changeViolation(content, merged)) {
      continue;
    }
    return merged;
  }
  return null;
}

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
  // A locked fact (the header, a position's employer, title or context)
  // the person didn't ask to change.
  | { kind: "notRequested" }
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
 * when it names a locked part, touches a locked fact the person didn't
 * ask to change (`requestedBy` must quote their request, found in their
 * messages, with the latest one about it), doesn't apply to the content
 * as it is, changes nothing, changes a fixed part's line count, or writes
 * a figure found neither in the frozen profile version, nor in the
 * document, nor in `sources` (the person's own words): the agent never
 * supplies a number nobody gave. A pending change whose lines the new
 * one rewrites is superseded by it.
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
  // The person's words asking for this change, when it touches a locked
  // fact; `request` is what they said, to check it against.
  requestedBy?: string;
  request?: UserRequest;
  // The changes already waiting: two can't rewrite the same lines, so the
  // new one takes the place of those it overlaps.
  pending?: Array<DocumentChangeContent & { id: string }>;
  // The ids of the waiting changes proposed in this same turn: one that
  // reorders adjacent lines with the new one is merged into it.
  sameTurnIds?: ReadonlySet<string>;
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
  const normalized = normalizeDocumentChange(input.content, proposed);
  if (!normalized) return refuse({ kind: "notFound" });
  const change = mergeReorder(input.content, normalized, input) ?? normalized;
  if (normalized.find === normalized.replace) {
    return refuse({ kind: "unchanged" });
  }
  const violation = changeViolation(input.content, change);
  if (violation) return refuse({ kind: violation });
  if (
    isLockedFactPart(key) &&
    !userRequested(
      input.request ?? {
        said: input.sources,
        latest: input.sources.at(-1) ?? "",
      },
      input.requestedBy,
      change
    )
  ) {
    return refuse({ kind: "notRequested" });
  }

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

/**
 * Proposes moving a resume section, with its content, above or below
 * another (resume spec, "Document workspace"): a pending suggestion like
 * any other, never written until the user accepts. Section order isn't a
 * locked fact, so it needs no `requestedBy`. Refused when a section isn't
 * printed, or it already sits there. A pending move of the same section
 * is superseded by the new one.
 */
export async function proposeSectionMove(input: {
  db: DbClient;
  cipher: UserCipher;
  versionId: string;
  snapshotId: string;
  content: ChangeableContent;
  origin: DocumentChangeOrigin;
  move: SectionMove;
  reason: string;
  pending?: Array<DocumentChangeContent & { id: string }>;
}): Promise<
  | { ok: true; change: DocumentChange; supersededIds: string[] }
  | { ok: false; refusal: ChangeRefusal }
> {
  if (input.content.kind !== "resume") {
    return { ok: false, refusal: { kind: "noSuchPart" } };
  }
  const kinds = input.content.sections.map((section) => section.kind);
  if (!kinds.includes(input.move.kind) || !kinds.includes(input.move.anchor)) {
    return { ok: false, refusal: { kind: "noSuchPart" } };
  }
  if (!applySectionMove(input.content, input.move)) {
    return { ok: false, refusal: { kind: "unchanged" } };
  }
  const part = sectionMovePart(input.move.kind);
  const content: DocumentChangeContent = {
    part,
    find: "",
    replace: sectionMoveText(input.move),
    reason: input.reason.trim(),
    evidenceIds: [],
  };
  const supersededIds = (input.pending ?? [])
    .filter((other) => other.part === part)
    .map((other) => other.id);
  const row = await input.db.transaction(async (tx) => {
    const repository = new DocumentsRepository(tx);
    await repository.resolveChanges({
      versionId: input.versionId,
      resolution: "superseded",
      documentChangeIds: supersededIds,
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
    supersededIds,
    change: {
      id: row.id,
      versionId: row.versionId,
      origin: row.origin,
      createdAt: row.createdAt,
      ...content,
    },
  };
}
