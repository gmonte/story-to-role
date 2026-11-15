import { z } from "zod";

/** The REST bridge's metadata for a protected procedure. */
export function openApiMeta(
  tag: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: `/${string}`,
  summary: string
) {
  return { openapi: { method, path, tags: [tag], summary, protect: true } };
}

/** Mutations answer an object (trpc-to-openapi has no void output). */
export const okSchema = z.object({ ok: z.literal(true) });
export const ok = { ok: true as const };
