import { TRPCError } from "@trpc/server";

import {
  getUserCipher,
  type UserCipher,
} from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { CareerRepository } from "../career-repository";
import { recordCareerEvent } from "../record-career-event";
import type { AccountSource } from "../schemas/career";
import { AccountsRepository } from "./accounts-repository";

const notFound = () => new TRPCError({ code: "NOT_FOUND" });

type VersionRow = Awaited<
  ReturnType<AccountsRepository["listVersions"]>
>[number];

const open = (cipher: UserCipher, row: VersionRow) => ({
  accountVersionId: row.id,
  version: row.version,
  text: cipher.decrypt(row.encryptedText),
  doNotInclude: JSON.parse(
    cipher.decrypt(row.encryptedDoNotInclude)
  ) as string[],
  source: row.source,
  approvedAt: row.approvedAt,
  createdAt: row.createdAt,
});

/**
 * A position's account (ADR 0008): the user's own text, approved as a
 * whole and kept as versions. A position has at most one draft; approving
 * it makes it the account; any earlier version can be restored as a draft.
 */
export class AccountsService {
  constructor(private readonly db: DbClient) {}

  /** The approved account, the draft, and every version's header. */
  async getAccount(input: { userId: string; positionId: string }) {
    const { cipher, positionId } = await this.requirePosition(this.db, input);
    const rows = await new AccountsRepository(this.db).listVersions(positionId);
    // Newest number first: the account is the highest approved version.
    const approvedRows = rows
      .filter((row) => row.approvedAt)
      .sort((a, b) => b.version! - a.version!);
    const approved = approvedRows[0];
    const draft = rows.find((row) => !row.approvedAt);
    return {
      approved: approved ? open(cipher, approved) : null,
      draft: draft ? open(cipher, draft) : null,
      versions: approvedRows.map((row) => ({
        accountVersionId: row.id,
        version: row.version!,
        source: row.source,
        approvedAt: row.approvedAt!,
      })),
    };
  }

  /** One version's full text, to read an earlier account. */
  async getVersion(input: { userId: string; accountVersionId: string }) {
    const profile = await this.requireProfile(this.db, input.userId);
    const row = await new AccountsRepository(this.db).findVersion({
      profileId: profile.id,
      accountVersionId: input.accountVersionId,
    });
    if (!row) throw notFound();
    return open(await getUserCipher(this.db, input.userId), row);
  }

  /** Writes the position's draft, replacing the one there is. */
  async saveDraft(input: {
    userId: string;
    positionId: string;
    text: string;
    doNotInclude: string[];
    source?: AccountSource;
    restoredFromId?: string;
  }) {
    await this.db.transaction(async (tx) => {
      const { cipher, positionId, profileId } = await this.requirePosition(
        tx,
        input
      );
      const accounts = new AccountsRepository(tx);
      const fields = {
        encryptedText: cipher.encrypt(input.text),
        encryptedDoNotInclude: cipher.encrypt(
          JSON.stringify(
            [...new Set(input.doNotInclude.map((item) => item.trim()))].filter(
              Boolean
            )
          )
        ),
        source: input.source ?? "user",
        restoredFromId: input.restoredFromId ?? null,
      };
      const draft = await accounts.findDraft(positionId);
      if (draft) await accounts.updateVersion(draft.id, fields);
      else await accounts.insertVersion({ profileId, positionId, ...fields });
    });
  }

  /** The draft becomes the account, numbered after the last one. */
  async approveDraft(input: { userId: string; positionId: string }) {
    await this.db.transaction(async (tx) => {
      const { positionId, profileId, label } = await this.requirePosition(
        tx,
        input
      );
      const accounts = new AccountsRepository(tx);
      const draft = await accounts.findDraft(positionId);
      if (!draft) throw notFound();
      const version = (await accounts.lastVersionNumber(positionId)) + 1;
      await accounts.updateVersion(draft.id, {
        version,
        approvedAt: new Date(),
      });
      await recordCareerEvent(tx, {
        userId: input.userId,
        profileId,
        kind: "account_approved",
        summary: `approved version ${version} of the account of ${label}`,
      });
    });
  }

  async discardDraft(input: { userId: string; positionId: string }) {
    await this.db.transaction(async (tx) => {
      const { positionId } = await this.requirePosition(tx, input);
      const accounts = new AccountsRepository(tx);
      const draft = await accounts.findDraft(positionId);
      if (draft) await accounts.deleteVersion(draft.id);
    });
  }

  /** An earlier version comes back as the draft, to approve again. */
  async restoreVersion(input: { userId: string; accountVersionId: string }) {
    const version = await this.getVersion(input);
    const profile = await this.requireProfile(this.db, input.userId);
    const row = await new AccountsRepository(this.db).findVersion({
      profileId: profile.id,
      accountVersionId: input.accountVersionId,
    });
    if (!row?.approvedAt) throw notFound();
    await this.saveDraft({
      userId: input.userId,
      positionId: row.positionId,
      text: version.text,
      doNotInclude: version.doNotInclude,
      source: "user",
      restoredFromId: row.id,
    });
  }

  private async requireProfile(db: DbClient, userId: string) {
    const profile = await new CareerRepository(db).findProfileByUserId(userId);
    if (!profile) throw notFound();
    return profile;
  }

  /** The user's own position, with what working on its account needs. */
  private async requirePosition(
    db: DbClient,
    input: { userId: string; positionId: string }
  ) {
    const profile = await this.requireProfile(db, input.userId);
    const position = await new CareerRepository(db).findPosition({
      profileId: profile.id,
      positionId: input.positionId,
    });
    if (!position) throw notFound();
    const cipher = await getUserCipher(db, input.userId);
    return {
      cipher,
      profileId: profile.id,
      positionId: position.id,
      label: `${cipher.decrypt(position.encryptedTitle)} at ${cipher.decrypt(position.encryptedEmployer)}`,
    };
  }
}
