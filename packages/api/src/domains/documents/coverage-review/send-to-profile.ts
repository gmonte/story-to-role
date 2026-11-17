import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { suggestLine } from "@repo/api/domains/profile/suggestions/suggest-line";
import type { DbClient } from "@repo/api/tools/db-client";

/**
 * Proposes a document line as a result of its experience in the user's
 * current draft (profile spec, "Suggestions"; origin `application`): the
 * experience is found by the position's derived id, so a renamed one is
 * reported rather than guessed. The line goes under "Results:", after its
 * last item, or opens that field. Refusals are the caller's bad request.
 */
export function sendLineToProfile(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
  careerProfileId: string;
  positionId: string;
  text: string;
  reason: string;
}) {
  return suggestLine({
    db: input.db,
    cipher: input.cipher,
    userId: input.userId,
    careerProfileId: input.careerProfileId,
    target: {
      kind: "experience",
      positionId: input.positionId,
      field: "results",
    },
    text: input.text,
    reason: input.reason,
  });
}
