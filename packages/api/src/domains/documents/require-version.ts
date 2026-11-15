import { TRPCError } from "@trpc/server";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "./documents-repository";

/** A version of the user's, with its document; locked on request. */
export async function requireUserVersion(
  tx: DbClient,
  userId: string,
  versionId: string,
  { lock = false } = {}
) {
  const repository = new DocumentsRepository(tx);
  const profile = await new CareerRepository(tx).findProfileByUserId(userId);
  const version = await repository.findVersion(versionId);
  const document = version
    ? await repository.findDocument(version.documentId)
    : null;
  if (!profile || !version || document?.profileId !== profile.id) {
    throw new TRPCError({ code: "NOT_FOUND" });
  }
  if (lock) await repository.lockVersion(version.id);
  return { version, document, profile };
}
