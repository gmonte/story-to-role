import type { NextRequest } from "next/server";
import { z } from "zod";

import { DocumentsService } from "@repo/api/domains/career/documents/documents-service";
import { db } from "@repo/api/tools/db";
import { upstashRateLimiter } from "@repo/api/tools/rate-limit";
import { logger } from "@repo/common/tools/logger";

import { currentUserId } from "~/app/api/documents/download";

/**
 * One page of a PDF source, rendered as a PNG on the server: the preview
 * never hands the browser the PDF itself, so no script it carries can run.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sourceDocumentId: string; page: string }> }
) {
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });
  const { sourceDocumentId, page } = await params;
  const pageNumber = Number(page);
  if (
    !z.uuid().safeParse(sourceDocumentId).success ||
    !Number.isInteger(pageNumber)
  ) {
    return new Response(null, { status: 404 });
  }
  // Rendering a page costs CPU: a script can't loop on it.
  if (!(await upstashRateLimiter.allow("pageRender", userId))) {
    return new Response(null, { status: 429 });
  }
  try {
    const png = await new DocumentsService(db).renderPage({
      userId,
      sourceDocumentId,
      page: pageNumber,
    });
    return new Response(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    // Not the user's, or unreadable: never say which to the client.
    logger.warn(["career"], "Source page preview failed", { error });
    return new Response(null, { status: 404 });
  }
}
