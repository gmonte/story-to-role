import { TRPCError } from "@trpc/server";

import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import type { Purpose } from "../generation/assemble-resume";
import {
  type CareerContext,
  loadCareerContext,
} from "../generation/load-career-context";
import { type OpeningBrief, purposesOf } from "../generation/resume-prompts";
import { loadOpeningBrief } from "../generation/run-generate-resume";
import { pdfTemplate } from "../rendering/pdf-template";
import {
  defaultGenerationSettings,
  type GenerationSettings,
  generationSettingsSchema,
} from "../schemas/generation-settings";
import type { OutputLanguage } from "../schemas/document";
import { loadLetterOwnSources } from "../letter/letter-own-sources";
import { decryptDocument } from "../snapshot-content";
import { linkedinAsResume } from "../linkedin/linkedin-resume";
import { checkDocument } from "./check-document";
import { checkLetter } from "./check-letter";
import { isWarningFinding } from "./warning-codes";

type Snapshot = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findSnapshot"]>>
>;
type Document = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findDocument"]>>
>;

/**
 * What a snapshot's checks read, loaded once per profile version, opening
 * and language within one request (a view lists several versions, and the
 * ZIP or a submission checks several documents).
 */
export class FrozenContexts {
  private readonly contexts = new Map<string, Promise<CareerContext>>();
  private readonly briefs = new Map<string, Promise<OpeningBrief>>();
  private readonly applications = new Map<string, Promise<string | null>>();

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
        const filter = await loadNeverIncludeFilter({
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

  /** The opening a document's application is for, if it has one. */
  openingOf(applicationId: string | null): Promise<string | null> {
    if (!applicationId) return Promise.resolve(null);
    let opening = this.applications.get(applicationId);
    if (!opening) {
      opening = new DocumentsRepository(this.db)
        .findApplication(applicationId)
        .then((row) => row?.openingId ?? null);
      this.applications.set(applicationId, opening);
    }
    return opening;
  }

  /**
   * The opening as the checks read it, its fit check's lines resolved in
   * the frozen version's.
   */
  brief(openingId: string, context: CareerContext): Promise<OpeningBrief> {
    const key = [openingId, context.profileVersionId].join(":");
    let brief = this.briefs.get(key);
    if (!brief) {
      brief = loadOpeningBrief({
        db: this.db,
        cipher: this.cipher,
        openingId,
        evidenceOfPassage: context.evidenceOfPassage,
      });
      this.briefs.set(key, brief);
    }
    return brief;
  }
}

/**
 * The settings a version was written with: its latest generation's, else
 * the document's latest generation's, else the defaults.
 */
export async function writtenSettings(
  repository: DocumentsRepository,
  version: { id: string; documentId: string },
  // The version's latest written generation, when the caller has it.
  written?: { settings: GenerationSettings | null } | null
): Promise<GenerationSettings> {
  const own =
    written === undefined
      ? await repository.latestWrittenGeneration(version.id)
      : written;
  const settings =
    own?.settings ?? (await repository.writtenSettings(version.documentId));
  return generationSettingsSchema
    .catch(defaultGenerationSettings)
    .parse(settings ?? defaultGenerationSettings);
}

/**
 * The code checks of the coverage review on one resume or cover letter
 * snapshot (resume spec, "Coverage review"), against what it froze: the
 * profile version its
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
  // What the caller already read: the version's latest written generation
  // and the snapshot's rendered file.
  written?: { settings: GenerationSettings | null } | null;
  rendered?: { pages: number } | null;
  /** This month (YYYY-MM): what "recent" is measured from. */
  today?: string;
}) {
  const { cipher } = input;
  const repository = new DocumentsRepository(input.db);
  const content = decryptDocument(cipher, input.snapshot);
  const openingId = await input.contexts.openingOf(
    input.document.applicationId
  );
  const context = await input.contexts.load({
    profileVersionId: input.snapshot.profileVersionId,
    openingId,
    language: input.version.language,
  });
  const focus = input.document.encryptedFocus
    ? cipher.decrypt(input.document.encryptedFocus)
    : null;
  const brief = openingId
    ? await input.contexts.brief(openingId, context)
    : { title: focus, company: null, terms: [], fitCheck: [], focus };
  const purposes: Purpose[] = purposesOf(brief);
  const rendered =
    input.rendered === undefined
      ? await repository.findRenderedFile(input.snapshot.id, pdfTemplate)
      : input.rendered;
  const settings = await writtenSettings(
    repository,
    input.version,
    input.written
  );
  const findings =
    content.kind === "linkedin"
      ? // The resume's checks on LinkedIn's view as a resume. A LinkedIn
        // text has no requirement to justify a very old experience, and no
        // page limit.
        checkDocument({
          content: linkedinAsResume(content),
          context,
          settings,
          today: input.today ?? new Date().toISOString().slice(0, 7),
          purposes: [],
          targetTitle: null,
          pages: null,
        })
      : content.kind === "cover_letter"
        ? checkLetter({
            content,
            context,
            settings,
            ownSources: await loadLetterOwnSources({
              db: input.db,
              cipher,
              openingId,
              content,
            }),
            pages: rendered?.pages ?? null,
          })
        : checkDocument({
            content,
            context,
            settings,
            today: input.today ?? new Date().toISOString().slice(0, 7),
            purposes,
            targetTitle: brief.focus ? null : brief.title,
            pages: rendered?.pages ?? null,
          });
  return { context, findings };
}

/** The message of the refusal the user can confirm past. */
export const warningsToConfirm = "WARNINGS_TO_CONFIRM";

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
  // Shared by the caller when it checks several documents at once.
  contexts?: FrozenContexts;
  // The user confirmed leaving with warnings (a real name a public name
  // should have replaced); other findings still block.
  acknowledgeWarnings?: boolean;
}) {
  const { findings } = await snapshotCoverage({
    ...input,
    contexts:
      input.contexts ??
      new FrozenContexts(input.db, input.cipher, input.profileId),
  });
  if (findings.some((finding) => !isWarningFinding(finding))) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The document has coverage findings to fix before it can leave.",
    });
  }
  if (findings.length > 0 && !input.acknowledgeWarnings) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: warningsToConfirm,
    });
  }
}
