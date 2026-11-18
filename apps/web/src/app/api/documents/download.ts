import { auth } from "@clerk/nextjs/server";

import { asciiName } from "@repo/api/domains/documents/rendering/file-names";
import { UsersRepository } from "@repo/api/domains/users/users-repository";
import { db } from "@repo/api/tools/db";

/** Our user behind the Clerk session, or null when signed out. */
export async function currentUserId() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return null;
  const user = await new UsersRepository(db).findActiveByClerkUserId(
    clerkUserId
  );
  return user?.id ?? null;
}

/**
 * A file download under the suggested name, or the one the user edited,
 * kept ASCII (resume spec, "Download").
 */
export function fileResponse(input: {
  bytes: Buffer;
  fileName: string;
  requested: string | null;
  contentType: string;
  extension: string;
  // Shown in the page (the editor's preview) instead of saved.
  inline?: boolean;
}) {
  const requested = input.requested
    ? asciiName(
        input.requested.replace(new RegExp(`\\.${input.extension}$`, "i"), "")
      )
    : "";
  const fileName = requested
    ? `${requested}.${input.extension}`
    : input.fileName;
  return new Response(new Uint8Array(input.bytes), {
    headers: {
      "Content-Type": input.contentType,
      "Content-Disposition": `${input.inline ? "inline" : "attachment"}; filename="${fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
