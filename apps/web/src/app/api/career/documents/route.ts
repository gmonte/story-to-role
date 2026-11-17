import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { documentLimits } from "@repo/api/domains/career/documents/document-limits";
import { DocumentsService } from "@repo/api/domains/career/documents/documents-service";
import { ImportService } from "@repo/api/domains/profile/import/import-service";
import { UsersRepository } from "@repo/api/domains/users/users-repository";
import { db } from "@repo/api/tools/db";
import { upstashRateLimiter } from "@repo/api/tools/rate-limit";

const formSchema = z.object({
  file: z.instanceof(File),
});

/**
 * Receives a source, a resume, a LinkedIn PDF, notes or a truth file
 * (multipart, which tRPC doesn't carry). The file goes to storage
 * encrypted, and its import into profile suggestions starts at once; when
 * it can't (no credits), the file stays and can be imported later.
 */
export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response(null, { status: 401 });

  const user = await new UsersRepository(db).findActiveByClerkUserId(
    clerkUserId
  );
  if (!user) return new Response(null, { status: 404 });

  if (!(await upstashRateLimiter.allow("sourceUpload", user.id))) {
    return new Response(null, { status: 429 });
  }

  // Refuse oversized uploads before reading the body (a little room for the
  // multipart framing around the file).
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!length || length > documentLimits.maxBytes + 64 * 1024) {
    return new Response(null, { status: 413 });
  }

  const form = formSchema.safeParse(
    Object.fromEntries(await request.formData())
  );
  if (!form.success) return new Response(null, { status: 400 });

  try {
    const result = await new DocumentsService(db).upload({
      userId: user.id,
      fileName: form.data.file.name,
      mimeType: form.data.file.type,
      bytes: Buffer.from(await form.data.file.arrayBuffer()),
    });
    // The file is kept whatever happens to its import.
    const importError = await new ImportService(db)
      .start({ userId: user.id, sourceDocumentId: result.sourceDocumentId })
      .then(() => null)
      .catch((error: unknown) => (error as { code?: string }).code ?? "FAILED");
    return Response.json({ ...result, importError });
  } catch (error) {
    // Matched by code: the error class may come from another copy of tRPC.
    const { code } = error as { code?: string };
    const status: Record<string, number> = {
      PRECONDITION_FAILED: 412,
      // Already holding the most sources a user can keep.
      CONFLICT: 409,
    };
    return new Response(null, { status: status[code ?? ""] ?? 400 });
  }
}
