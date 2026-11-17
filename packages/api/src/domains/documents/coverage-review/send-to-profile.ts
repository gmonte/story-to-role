import { TRPCError } from "@trpc/server";

import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import {
  proposeSuggestion,
  readSuggestionContent,
} from "@repo/api/domains/profile/suggestions/propose-suggestion";
import {
  blockToLine,
  parseBlocks,
  type ProfileBlock,
} from "@repo/api/domains/profile/truth/blocks";
import { experienceKeys } from "@repo/api/domains/profile/truth/chunks";
import {
  experienceFieldLabels,
  normalizeLabel,
} from "@repo/api/domains/profile/truth/sections";
import { readStructure } from "@repo/api/domains/profile/truth/structure";
import type { DbClient } from "@repo/api/tools/db-client";

import { stableId } from "../generation/profile-source";

/**
 * Proposes a resume line as a result of its experience in the user's
 * current draft (profile spec, "Suggestions"; origin `application`): the
 * experience is found by the position's derived id, so a renamed one is
 * reported rather than guessed. The line goes under "Results:", after its
 * last item, or opens that field. Refusals are the caller's bad request.
 */
export async function sendLineToProfile(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
  careerProfileId: string;
  positionId: string;
  text: string;
  reason: string;
}) {
  const repository = new ProfileRepository(input.db);
  const document = await repository.findDocument(input.userId, "profile");
  if (!document) throw new TRPCError({ code: "NOT_FOUND" });
  const blocks = parseBlocks(input.cipher.decrypt(document.encryptedDraft));
  const structure = readStructure(blocks);
  const index = structure.experiences.findIndex(
    (experience) =>
      experience.parsed &&
      stableId(
        input.careerProfileId,
        "position",
        normalizeLabel(experience.parsed.company),
        normalizeLabel(experience.parsed.title),
        experience.parsed.range.start
      ) === input.positionId
  );
  if (index < 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The draft no longer has this position.",
    });
  }
  const experience = structure.experiences[index];
  const part = experienceKeys(structure)[index];
  const text = input.text.trim();
  // After the field's last item, or under the field itself when it has
  // none; a draft without the field gets it at the end of the experience.
  const results = experience.fields.results;
  const last = results?.children.at(-1);
  const anchor: ProfileBlock | null =
    last !== undefined ? blocks[last] : results ? blocks[results.line] : null;
  const depth = (block: ProfileBlock) =>
    block.type === "item" ? block.depth : 0;
  const added: ProfileBlock = {
    type: "item",
    depth: anchor ? depth(anchor) + (last === undefined ? 1 : 0) : 1,
    text,
  };
  const change = anchor
    ? {
        part,
        find: blockToLine(anchor),
        replace: [anchor, added].map(blockToLine).join("\n"),
      }
    : {
        part,
        find: "",
        replace: [
          `- ${experienceFieldLabels[structure.language].results}:`,
          blockToLine(added),
        ].join("\n"),
      };
  const pending = (await repository.listPendingSuggestions(document.id)).map(
    (row) => ({ id: row.id, ...readSuggestionContent(input.cipher, row) })
  );
  const proposed = await proposeSuggestion({
    db: input.db,
    cipher: input.cipher,
    documentId: document.id,
    draft: blocks,
    origin: "application",
    change,
    reason: input.reason,
    // The line is the user's own statement: its figures are theirs.
    sources: [text],
    pending,
  });
  if (!proposed.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The suggestion was refused: ${proposed.refusal.kind}.`,
    });
  }
  return { profileSuggestionId: proposed.suggestion.id };
}
