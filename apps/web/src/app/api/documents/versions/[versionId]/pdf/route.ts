import type { NextRequest } from "next/server";

import { PdfService } from "@repo/api/domains/documents/rendering/pdf-service";
import { db } from "@repo/api/tools/db";
import { logger } from "@repo/common/tools/logger";

import { currentUserId, fileResponse } from "../../../download";

/**
 * The PDF of a version's official snapshot, once rendered (409 before):
 * served by the app, since the stored file is encrypted per user.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ versionId: string }> }
) {
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });
  const { versionId } = await params;
  try {
    const file = await new PdfService(db).read({
      userId,
      versionId,
      acknowledgeWarnings:
        request.nextUrl.searchParams.get("acknowledge") === "1",
    });
    if (!file) return new Response(null, { status: 409 });
    return fileResponse({
      ...file,
      requested: request.nextUrl.searchParams.get("name"),
      contentType: "application/pdf",
      extension: "pdf",
    });
  } catch (error) {
    // Not the user's, or unreadable: never say which to the client.
    logger.warn(["documents"], "PDF download failed", { error });
    return new Response(null, { status: 404 });
  }
}
