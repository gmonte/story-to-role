import { TRPCError } from "@trpc/server";

import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import type { Purpose } from "../generation/assemble-resume";
import {
  type CareerContext,
  loadCareerContext,
} from "../generation/load-career-context";
import { purposesOf } from "../generation/resume-prompts";
import { loadOpeningBrief } from "../generation/run-generate-resume";
import { pdfTemplate } from "../rendering/pdf-template";
import {
  defaultGenerationSettings,
  type GenerationSettings,
  generationSettingsSchema,
} from "../schemas/generation-settings";
import type { OutputLanguage } from "../schemas/document";
import { decryptResume } from "../snapshot-content";
import { checkDocument, type CoverageFinding } from "./check-document";

type Snapshot = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findSnapshot"]>>
>;
type Document = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findDocument"]>>
>;

/**
 * What a snapshot's checks read, loaded once per profile version, opening
 * and language within one request (a view lists several versions).
 */
export class FrozenContexts {
  private readonly contexts = new Map<string, Promise<CareerContext>>();

  constructor(
    private readonly db: DbClient,
    private readonly cipher: UserCipher,
    private readonly profileId: string
  ) {}

  /**
   * The career as the document froze it: the given profile version (the
   * one published now when a snapshot carries none), with the opening's
   * instructions and overrides and the titles approved for the language.
   */
  load(input: {
    profileVersionId: string | null;
    openingId: string | null;
    language: OutputLanguage;
  }): Promise<CareerContext> {
    const key = [input.profileVersionId, input.openingId, input.language].join(
      ":"
    );
    let context = this.contexts.get(key);
    if (!context) {
      context = (async () => {
        const filter = await loadSensitiveFilter({
          db: this.db,
          cipher: this.cipher,
          profileId: this.profileId,
          profileVersionId: input.profileVersionId,
        });
        return loadCareerContext({
          db: this.db,
          cipher: this.cipher,
          profileId: this.profileId,
          filter,
          profileVersionId: input.profileVersionId,
          openingId: input.openingId ?? undefined,
          language: input.language,
        });
      })();
      this.contexts.set(key, context);
    }
    return context;
  }
}

/**
 * The settings a version was written with: its latest generation's, else
 * the document's latest generation's, else the defaults.
 */
export async function writtenSettings(
  repository: DocumentsRepository,
  version: { id: string; documentId: string }
): Promise<GenerationSettings> {
  const written = await repository.latestWrittenGeneration(version.id);
  const settings =
    written?.settings ?? (await repository.writtenSettings(version.documentId));
  return generationSettingsSchema
    .catch(defaultGenerationSettings)
    .parse(settings ?? defaultGenerationSettings);
}

/**
 * The code checks of the coverage review on one resume snapshot (resume
 * spec, "Coverage review"), against what it froze: the profile version its
 * content was written from, the settings of the generation that wrote the
 * version and the opening's requirements (or the focus). The rendered
 * PDF's measured pages count when a file exists.
 */
export async function snapshotCoverage(input: {
  db: DbClient;
  cipher: UserCipher;
  contexts: FrozenContexts;
  document: Pick<Document, "id" | "applicationId" | "encryptedFocus">;
  version: { id: string; documentId: string; language: OutputLanguage };
  snapshot: Pick<Snapshot, "id" | "encryptedContent" | "profileVersionId">;
  /** This month (YYYY-MM): what "recent" is measured from. */
  today?: string;
}) {
  const { db, cipher } = input;
  const repository = new DocumentsRepository(db);
  const content = decryptResume(cipher, input.snapshot);
  const application = input.document.applicationId
    ? await repository.findApplication(input.document.applicationId)
    : null;
  const context = await input.contexts.load({
    profileVersionId: input.snapshot.profileVersionId,
    openingId: application?.openingId ?? null,
    language: input.version.language,
  });
  const focus = input.document.encryptedFocus
    ? cipher.decrypt(input.document.encryptedFocus)
    : null;
  const brief = application
    ? await loadOpeningBrief({
        db,
        cipher,
        openingId: application.openingId,
        evidenceOfPassage: context.evidenceOfPassage,
      })
    : { title: focus, company: null, terms: [], fitCheck: [], focus };
  const purposes: Purpose[] = purposesOf(brief);
  const rendered = await repository.findRenderedFile(
    input.snapshot.id,
    pdfTemplate
  );
  const findings = checkDocument({
    content,
    context,
    settings: await writtenSettings(repository, input.version),
    today: input.today ?? new Date().toISOString().slice(0, 7),
    purposes,
    targetTitle: brief.focus ? null : brief.title,
    pages: rendered?.pages ?? null,
  });
  return { content, context, brief, purposes, findings };
}

/**
 * A resume whose official snapshot has code findings never leaves the
 * platform (resume spec, "Coverage review": a failure blocks the document
 * until it is fixed): downloads and sending refuse it.
 */
export async function assertSendable(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  document: Document;
  version: { id: string; documentId: string; language: OutputLanguage };
  snapshot: Pick<Snapshot, "id" | "encryptedContent" | "profileVersionId">;
}): Promise<CoverageFinding[]> {
  // The cover letter's review comes with its own slice (docs/plan.md, P8).
  if (input.document.kind !== "resume") return [];
  const { findings } = await snapshotCoverage({
    ...input,
    contexts: new FrozenContexts(input.db, input.cipher, input.profileId),
  });
  if (findings.length > 0) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The document has coverage findings to fix before it can leave.",
    });
  }
  return findings;
}
