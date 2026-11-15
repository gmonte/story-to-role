import { z } from "zod";

import { applicationStatusSchema } from "@repo/api/domains/applications/schemas/application";

import { documentKindSchema, outputLanguageSchema } from "./document";

/** A library document, listed by its focus (resume spec, "Library documents"). */
export const libraryDocumentSchema = z.object({
  id: z.uuid(),
  kind: documentKindSchema,
  focus: z.string(),
  languages: z.array(outputLanguageSchema),
  createdAt: z.date(),
});
export type LibraryDocument = z.infer<typeof libraryDocumentSchema>;

/** A version close to an opening, from the library or another application. */
export const similarDocumentSchema = z.object({
  versionId: z.uuid(),
  documentId: z.uuid(),
  language: outputLanguageSchema,
  label: z.string().nullable(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("library"), focus: z.string() }),
    z.object({
      kind: z.literal("application"),
      openingId: z.uuid(),
      title: z.string().nullable(),
      company: z.string().nullable(),
      status: applicationStatusSchema,
    }),
  ]),
});
export type SimilarDocument = z.infer<typeof similarDocumentSchema>;
