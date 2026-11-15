import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";

import {
  type ResumeContent,
  resumeContentSchema,
} from "./schemas/resume-content";

/** A snapshot's structured content, decrypted and validated. */
export const decryptSnapshot = (
  cipher: UserCipher,
  snapshot: { encryptedContent: string }
): ResumeContent =>
  resumeContentSchema.parse(
    JSON.parse(cipher.decrypt(snapshot.encryptedContent))
  );
