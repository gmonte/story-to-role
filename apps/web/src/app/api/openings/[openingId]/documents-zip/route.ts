import { PdfService } from "@repo/api/domains/documents/rendering/pdf-service";
import { db } from "@repo/api/tools/db";

import { currentUserId, fileResponse } from "../../../documents/download";

/** The application's ZIP, once every version's PDF is rendered (409 before). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ openingId: string }> }
) {
  const userId = await currentUserId();
  if (!userId) return new Response(null, { status: 401 });
  const { openingId } = await params;
  try {
    const file = await new PdfService(db).readApplicationZip({
      userId,
      openingId,
    });
    if (!file) return new Response(null, { status: 409 });
    return fileResponse({
      ...file,
      requested: null,
      contentType: "application/zip",
      extension: "zip",
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
