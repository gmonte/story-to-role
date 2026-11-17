import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { ProfileRepository } from "../profile-repository";
import type {
  ProfileSuggestion,
  ProfileSuggestionOrigin,
} from "../schemas/profile";
import { serializeBlocks, type ProfileBlock } from "../truth/blocks";
import {
  locateChange,
  normalizeChange,
  ungivenFigures,
  type ProfileChange,
} from "../truth/suggestions";

/** What a suggestion's row holds, encrypted. */
export type SuggestionContent = ProfileChange & { reason: string };

export type ProposalRefusal =
  | { kind: "empty" }
  | { kind: "notFound" }
  | { kind: "unchanged" }
  | { kind: "overlapsPending" }
  | { kind: "ungivenFigures"; figures: string[] };

/**
 * Proposes a change to the draft as a pending suggestion (profile spec,
 * "Suggestions"): nothing reaches the profile until the user accepts it.
 * Refused when it doesn't apply to the draft as it is, changes nothing,
 * rewrites lines another pending suggestion already rewrites, or writes a
 * figure found neither in the profile nor in `sources` (the
 * user's own words): the AI never proposes a number the user didn't give.
 */
export async function proposeSuggestion(input: {
  db: DbClient;
  cipher: UserCipher;
  documentId: string;
  draft: ProfileBlock[];
  origin: ProfileSuggestionOrigin;
  change: ProfileChange;
  reason: string;
  sources: string[];
  // The changes already waiting: two can't rewrite the same lines.
  pending?: ProfileChange[];
}): Promise<
  | { ok: true; suggestion: ProfileSuggestion }
  | { ok: false; refusal: ProposalRefusal }
> {
  const refuse = (refusal: ProposalRefusal) => ({
    ok: false as const,
    refusal,
  });
  if (!input.change.find.trim() && !input.change.replace.trim()) {
    return refuse({ kind: "empty" });
  }
  const change = normalizeChange(input.draft, input.change);
  if (!change) return refuse({ kind: "notFound" });
  if (change.find === change.replace) return refuse({ kind: "unchanged" });
  const range = locateChange(input.draft, change);
  const overlaps = (input.pending ?? []).some((other) => {
    const taken = locateChange(input.draft, other);
    return (
      range &&
      taken &&
      taken.end > taken.start &&
      range.start < taken.end &&
      taken.start < range.end
    );
  });
  if (overlaps) return refuse({ kind: "overlapsPending" });
  const figures = ungivenFigures(change.replace, [
    serializeBlocks(input.draft),
    ...input.sources,
  ]);
  if (figures.length) return refuse({ kind: "ungivenFigures", figures });

  const content: SuggestionContent = { ...change, reason: input.reason.trim() };
  const row = await new ProfileRepository(input.db).insertSuggestion({
    documentId: input.documentId,
    origin: input.origin,
    encryptedContent: input.cipher.encrypt(JSON.stringify(content)),
  });
  return {
    ok: true,
    suggestion: {
      id: row.id,
      origin: row.origin,
      createdAt: row.createdAt,
      ...content,
    },
  };
}
