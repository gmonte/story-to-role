import { AccountService } from "@repo/api/domains/account/account-service";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { currentUserId, fileResponse } from "../../documents/download";

/** Privacy spec, "Export": the user's whole account as one ZIP. */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });
  try {
    const file = await new AccountService(db).export(userId);
    return fileResponse({
      ...file,
      requested: null,
      contentType: "application/zip",
      extension: "zip",
    });
  } catch (error) {
    logger.error(["account"], "Export failed", { error });
    return new Response(null, { status: 500 });
  }
}
