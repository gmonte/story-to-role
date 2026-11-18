import { TRPCError } from "@trpc/server";
import { zipSync } from "fflate";

import { CareerRepository } from "@repo/api/domains/career/career-repository";
import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { TasksRepository } from "@repo/api/domains/tasks/tasks-repository";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import type { DbClient } from "@repo/api/tools/db-client";
import { getStorage, type Storage } from "@repo/api/tools/storage/storage";

import { decryptDocument } from "../snapshot-content";
import {
  assertSendable,
  FrozenContexts,
} from "../coverage-review/snapshot-coverage";
import { DocumentsRepository } from "../documents-repository";
import { requireUserVersion } from "../require-version";
import { fileNamer } from "./file-namer";
import { applicationZipName, uniqueFileNames } from "./file-names";
import { pdfTemplate } from "./pdf-template";

type Version = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findVersion"]>>
>;
type Document = NonNullable<
  Awaited<ReturnType<DocumentsRepository["findDocument"]>>
>;

/**
 * Downloads (resume spec, "Download"): PDFs rendered on demand in a task
 * from the official snapshot, kept per snapshot, and served under the
 * suggested file name; an application's ZIP holds every version's PDF.
 */
export class PdfService {
  constructor(
    private readonly db: DbClient,
    private readonly tasks = new TasksService(db),
    private readonly storageOverride?: Storage
  ) {}

  // Resolved only when a file is read, so callers that never touch files
  // need no storage driver.
  private get storage() {
    return this.storageOverride ?? getStorage();
  }

  /**
   * A download is the document leaving the platform: a resume whose official
   * snapshot has coverage findings is refused (resume spec, "Coverage
   * review").
   */
  private async requireSendable(
    tx: DbClient,
    userId: string,
    version: Version,
    document: Document,
    latest: Parameters<typeof assertSendable>[0]["snapshot"],
    contexts?: FrozenContexts,
    acknowledgeWarnings?: boolean
  ) {
    // LinkedIn text is copied from the interface, never exported as a file.
    if (document.kind === "linkedin")
      throw new TRPCError({ code: "BAD_REQUEST" });
    await assertSendable({
      db: tx,
      cipher: await getUserCipher(tx, userId),
      profileId: document.profileId,
      document,
      version,
      snapshot: latest,
      contexts,
      acknowledgeWarnings,
    });
  }

  /** Renders the version's official snapshot unless it is ready or rendering. */
  private async ensureRendered(
    tx: DbClient,
    userId: string,
    version: Version,
    document: Document,
    contexts?: FrozenContexts,
    acknowledgeWarnings?: boolean
  ) {
    const repository = new DocumentsRepository(tx);
    const latest = await repository.latestSnapshot(version.id);
    if (!latest) throw new TRPCError({ code: "NOT_FOUND" });
    await this.requireSendable(
      tx,
      userId,
      version,
      document,
      latest,
      contexts,
      acknowledgeWarnings
    );
    if (await repository.findRenderedFile(latest.id, pdfTemplate)) return true;
    if (!(await new TasksRepository(tx).activeTask(latest.id, "render_pdf"))) {
      await this.tasks.start({
        userId,
        type: "render_pdf",
        subjectId: latest.id,
      });
    }
    return false;
  }

  async request(input: {
    userId: string;
    versionId: string;
    acknowledgeWarnings?: boolean;
  }) {
    const { version, document } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    return {
      ready: await this.ensureRendered(
        this.db,
        input.userId,
        version,
        document,
        undefined,
        input.acknowledgeWarnings
      ),
    };
  }

  private async applicationVersions(userId: string, openingId: string) {
    const career = new CareerRepository(this.db);
    const profile = await career.findProfileByUserId(userId);
    const opening =
      profile &&
      (await new OpeningsRepository(this.db).findOpening({
        profileId: profile.id,
        openingId,
      }));
    if (!opening) throw new TRPCError({ code: "NOT_FOUND" });
    const repository = new DocumentsRepository(this.db);
    const application = await repository.findApplicationByOpening(opening.id);
    const documents = application
      ? await repository.listApplicationDocuments(application.id)
      : [];
    const versions = await repository.listVersions(
      documents.map((document) => document.id)
    );
    return { opening, documents, versions };
  }

  /** Starts what is missing for the application's ZIP; ready when none is. */
  async prepareApplication(input: {
    userId: string;
    openingId: string;
    acknowledgeWarnings?: boolean;
  }) {
    const { documents, versions } = await this.applicationVersions(
      input.userId,
      input.openingId
    );
    if (versions.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    let ready = true;
    // One reading of the frozen profile for all the application's documents.
    const contexts = new FrozenContexts(
      this.db,
      await getUserCipher(this.db, input.userId),
      documents[0].profileId
    );
    for (const version of versions) {
      const document = documents.find((row) => row.id === version.documentId)!;
      ready =
        (await this.ensureRendered(
          this.db,
          input.userId,
          version,
          document,
          contexts,
          input.acknowledgeWarnings
        )) && ready;
    }
    return { ready };
  }

  /** The version's official PDF and its suggested name; null until rendered. */
  private async readVersion(
    cipher: UserCipher,
    version: Version,
    document: Document,
    acknowledgeWarnings?: boolean
  ) {
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    if (!latest) return null;
    await assertSendable({
      acknowledgeWarnings,
      db: this.db,
      cipher,
      profileId: document.profileId,
      document,
      version,
      snapshot: latest,
    });
    const file = await repository.findRenderedFile(latest.id, pdfTemplate);
    const stored = file && (await this.storage.get(file.storageKey));
    if (!stored) return null;
    const nameFor = await fileNamer(this.db, cipher, document);
    return {
      bytes: Buffer.from(cipher.decrypt(stored.toString()), "base64"),
      fileName: nameFor(version, decryptDocument(cipher, latest)),
      label: version.encryptedLabel
        ? cipher.decrypt(version.encryptedLabel)
        : null,
    };
  }

  async read(input: {
    userId: string;
    versionId: string;
    acknowledgeWarnings?: boolean;
  }) {
    const { version, document } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const cipher = await getUserCipher(this.db, input.userId);
    return this.readVersion(
      cipher,
      version,
      document,
      input.acknowledgeWarnings
    );
  }

  /** `<Company>_<Title>.zip`; null while any version's PDF is missing. */
  async readApplicationZip(input: {
    userId: string;
    openingId: string;
    acknowledgeWarnings?: boolean;
  }) {
    const { opening, documents, versions } = await this.applicationVersions(
      input.userId,
      input.openingId
    );
    const cipher = await getUserCipher(this.db, input.userId);
    const files = [];
    for (const version of versions) {
      const document = documents.find((row) => row.id === version.documentId)!;
      const file = await this.readVersion(
        cipher,
        version,
        document,
        input.acknowledgeWarnings
      );
      if (!file) return null;
      files.push(file);
    }
    if (files.length === 0) return null;
    const names = uniqueFileNames(files);
    const open = (value: string | null) =>
      value ? cipher.decrypt(value) : null;
    return {
      bytes: Buffer.from(
        zipSync(
          Object.fromEntries(
            files.map((file, index) => [
              names[index],
              new Uint8Array(file.bytes),
            ])
          )
        )
      ),
      fileName: applicationZipName({
        company: open(opening.encryptedCompany),
        title: open(opening.encryptedTitle),
      }),
    };
  }
}
