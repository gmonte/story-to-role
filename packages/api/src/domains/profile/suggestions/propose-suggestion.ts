import { z } from "zod";

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
export const suggestionContentSchema = z.object({
  part: z.string(),
  find: z.string(),
  replace: z.string(),
  reason: z.string(),
});
export type SuggestionContent = z.infer<typeof suggestionContentSchema>;

export function readSuggestionContent(
  cipher: UserCipher,
  row: { encryptedContent: string }
): SuggestionContent {
  return suggestionContentSchema.parse(
    JSON.parse(cipher.decrypt(row.encryptedContent))
  );
}

export type SuggestionRefusal =
  | { kind: "empty" }
  | { kind: "notFound" }
  | { kind: "unchanged" }
  | { kind: "ungivenFigures"; figures: string[] };

/**
 * Proposes a change to the draft as a pending suggestion (profile spec,
 * "Suggestions"): nothing reaches the profile until the user accepts it.
 * Refused when it doesn't apply to the draft as it is, changes nothing or
 * writes a figure found neither in the profile nor in `sources` (the
 * user's own words): the AI never proposes a number the user didn't give.
 * A pending suggestion whose lines the new one rewrites is superseded by
 * it.
 */
/** The first written line of a change's new text, to compare additions. */
function firstNewLine(change: Pick<ProfileChange, "find" | "replace">) {
  const added = change.find
    ? change.replace.slice(change.find.length)
    : change.replace;
  return (
    added
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .find(Boolean) ?? ""
  );
}

/**
 * Waiting additions that start with the same line as this one (the same
 * new experience, proposed again): an addition has no lines to overlap, so
 * without this a second version would wait beside the first.
 */
export function sameAdditions(
  pending: Array<Pick<ProfileChange, "find" | "replace"> & { id: string }>,
  change: Pick<ProfileChange, "find" | "replace">
) {
  const isAddition = (other: Pick<ProfileChange, "find" | "replace">) =>
    !other.find.trim() || other.replace.startsWith(other.find);
  if (!isAddition(change)) return [];
  const first = firstNewLine(change);
  if (!first) return [];
  return pending
    .filter((other) => isAddition(other) && firstNewLine(other) === first)
    .map((other) => other.id);
}

export async function proposeSuggestion(input: {
  db: DbClient;
  cipher: UserCipher;
  documentId: string;
  draft: ProfileBlock[];
  origin: ProfileSuggestionOrigin;
  change: ProfileChange;
  reason: string;
  sources: string[];
  // The suggestions already waiting: two can't rewrite the same lines, so
  // the new one takes the place of those it overlaps.
  pending?: Array<ProfileChange & { id: string }>;
  // Waiting suggestions this one is a newer version of, whatever their
  // lines (an addition has none to overlap).
  supersedes?: string[];
}): Promise<
  | { ok: true; suggestion: ProfileSuggestion; supersededIds: string[] }
  | { ok: false; refusal: SuggestionRefusal }
> {
  const refuse = (refusal: SuggestionRefusal) => ({
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
  const supersededIds = (input.pending ?? [])
    .filter((other) => {
      const taken = locateChange(input.draft, other);
      return (
        range &&
        taken &&
        taken.end > taken.start &&
        range.start < taken.end &&
        taken.start < range.end
      );
    })
    .map((other) => other.id)
    .concat(sameAdditions(input.pending ?? [], change))
    .concat(input.supersedes ?? []);
  const figures = ungivenFigures(change.replace, [
    serializeBlocks(input.draft),
    ...input.sources,
  ]);
  if (figures.length) return refuse({ kind: "ungivenFigures", figures });

  const content: SuggestionContent = { ...change, reason: input.reason.trim() };
  const row = await input.db.transaction(async (tx) => {
    const repository = new ProfileRepository(tx);
    await repository.resolveSuggestions({
      documentId: input.documentId,
      resolution: "superseded",
      profileSuggestionIds: supersededIds,
    });
    return repository.insertSuggestion({
      documentId: input.documentId,
      origin: input.origin,
      encryptedContent: input.cipher.encrypt(JSON.stringify(content)),
    });
  });
  return {
    ok: true,
    supersededIds,
    suggestion: {
      id: row.id,
      origin: row.origin,
      createdAt: row.createdAt,
      ...content,
    },
  };
}
