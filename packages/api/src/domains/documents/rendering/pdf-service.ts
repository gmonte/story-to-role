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

  /** Renders the version's official snapshot unless it is ready or rendering. */
  private async ensureRendered(tx: DbClient, userId: string, version: Version) {
    const repository = new DocumentsRepository(tx);
    const latest = await repository.latestSnapshot(version.id);
    if (!latest) throw new TRPCError({ code: "NOT_FOUND" });
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

  async request(input: { userId: string; versionId: string }) {
    const { version } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    return { ready: await this.ensureRendered(this.db, input.userId, version) };
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
  async prepareApplication(input: { userId: string; openingId: string }) {
    const { versions } = await this.applicationVersions(
      input.userId,
      input.openingId
    );
    if (versions.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    let ready = true;
    for (const version of versions) {
      ready =
        (await this.ensureRendered(this.db, input.userId, version)) && ready;
    }
    return { ready };
  }

  /** The version's official PDF and its suggested name; null until rendered. */
  private async readVersion(
    cipher: UserCipher,
    version: Version,
    document: Document
  ) {
    const repository = new DocumentsRepository(this.db);
    const latest = await repository.latestSnapshot(version.id);
    const file =
      latest && (await repository.findRenderedFile(latest.id, pdfTemplate));
    const stored = file && (await this.storage.get(file.storageKey));
    if (!latest || !stored) return null;
    const nameFor = await fileNamer(this.db, cipher, document);
    return {
      bytes: Buffer.from(cipher.decrypt(stored.toString()), "base64"),
      fileName: nameFor(version, decryptDocument(cipher, latest)),
      label: version.encryptedLabel
        ? cipher.decrypt(version.encryptedLabel)
        : null,
    };
  }

  async read(input: { userId: string; versionId: string }) {
    const { version, document } = await requireUserVersion(
      this.db,
      input.userId,
      input.versionId
    );
    const cipher = await getUserCipher(this.db, input.userId);
    return this.readVersion(cipher, version, document);
  }

  /** `<Company>_<Title>.zip`; null while any version's PDF is missing. */
  async readApplicationZip(input: { userId: string; openingId: string }) {
    const { opening, documents, versions } = await this.applicationVersions(
      input.userId,
      input.openingId
    );
    const cipher = await getUserCipher(this.db, input.userId);
    const files = [];
    for (const version of versions) {
      const document = documents.find((row) => row.id === version.documentId)!;
      const file = await this.readVersion(cipher, version, document);
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
