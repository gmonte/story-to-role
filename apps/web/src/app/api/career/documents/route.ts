import { auth } from "@clerk/nextjs/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { documentLimits } from "@repo/api/domains/career/documents/document-limits";
import { DocumentsService } from "@repo/api/domains/career/documents/documents-service";
import { sourceDocumentKindSchema } from "@repo/api/domains/career/schemas/career";
import { UsersRepository } from "@repo/api/domains/users/users-repository";
import { db } from "@repo/api/tools/db";
import { upstashRateLimiter } from "@repo/api/tools/rate-limit";

const formSchema = z.object({
  kind: sourceDocumentKindSchema,
  file: z.instanceof(File),
});

/**
 * Receives an imported resume or truth file (multipart, which tRPC doesn't
 * carry). The file goes to storage encrypted and its import runs in a task.
 */
export async function POST(request: NextRequest) {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) return new Response(null, { status: 401 });

  const user = await new UsersRepository(db).findActiveByClerkUserId(
    clerkUserId
  );
  if (!user) return new Response(null, { status: 404 });

  if (!(await upstashRateLimiter.allow("taskStart", user.id))) {
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
      kind: form.data.kind,
      fileName: form.data.file.name,
      mimeType: form.data.file.type,
      bytes: Buffer.from(await form.data.file.arrayBuffer()),
    });
    return Response.json(result);
  } catch {
    return new Response(null, { status: 400 });
  }
}
