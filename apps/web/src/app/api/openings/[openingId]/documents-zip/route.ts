import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";

import { PdfService } from "@repo/api/domains/documents/rendering/pdf-service";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { currentUserId, fileResponse } from "../../../documents/download";

/** The application's ZIP, once every version's PDF is rendered (409 before). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ openingId: string }> }
) {
  await auth.protect();
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });
  const { openingId } = await params;
  try {
    const file = await new PdfService(db).readApplicationZip({
      userId,
      openingId,
      acknowledgeWarnings:
        request.nextUrl.searchParams.get("acknowledge") === "1",
    });
    if (!file) return new Response(null, { status: 409 });
    return fileResponse({
      ...file,
      requested: null,
      contentType: "application/zip",
      extension: "zip",
    });
  } catch (error) {
    // Not the user's, or unreadable: never say which to the client.
    logger.warn(["documents"], "ZIP download failed", { error });
    return new Response(null, { status: 404 });
  }
}
