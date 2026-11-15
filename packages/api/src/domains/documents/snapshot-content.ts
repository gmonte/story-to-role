import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";

import {
  type DocumentContent,
  documentContentSchema,
} from "./schemas/document-content";
import type { ResumeContent } from "./schemas/resume-content";

/** A snapshot's structured content, decrypted and validated. */
export const decryptDocument = (
  cipher: UserCipher,
  snapshot: { encryptedContent: string }
): DocumentContent =>
  documentContentSchema.parse(
    JSON.parse(cipher.decrypt(snapshot.encryptedContent))
  );

/** A resume snapshot's content; code that handles resumes only uses it. */
export const decryptResume = (
  cipher: UserCipher,
  snapshot: { encryptedContent: string }
): ResumeContent => {
  const content = decryptDocument(cipher, snapshot);
  if (content.kind !== "resume") throw new Error("Not a resume snapshot");
  return content;
};
