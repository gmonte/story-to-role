import { auth } from "@clerk/nextjs/server";

import { AccountService } from "@repo/api/domains/account/account-service";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { currentUserId } from "../../documents/download";

/** Privacy spec, "Export": the user's whole account as one ZIP, streamed. */
export async function GET() {
  await auth.protect();
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });
  try {
    const { stream, fileName } = await new AccountService(db).export(userId);
    return new Response(stream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logger.error(["account"], "Export failed", { error });
    return new Response(null, { status: 500 });
  }
}
