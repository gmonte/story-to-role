import { createHash } from "node:crypto";

/**
 * Which drafts a summary covered: their ids and (encrypted) content, so an
 * added, approved, discarded or edited draft changes it.
 */
export function draftsFingerprint(
  drafts: Array<{ id: string; encryptedPayload: string }>
) {
  return createHash("sha256")
    .update(
      drafts
        .map((draft) => `${draft.id}:${draft.encryptedPayload}`)
        .sort()
        .join("\n")
    )
    .digest("hex");
}
