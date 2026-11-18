import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";

import { profileDocumentsTable } from "./db/profile-tables";
import { ProfileService } from "./profile-service";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "token" })),
  };
  const profile = new ProfileService(db, new TasksService(db, trigger));
  const draft = () => profile.getDraft({ userId: user.id, language: "pt-BR" });
  return { db, user, profile, draft, trigger };
}

const wellFormed = (identity: string) => `# Perfil

## Identidade profissional

- ${identity}

## Contato (só o que pode aparecer no currículo)

## Experiência (mais recente primeiro)

## Formação

## Certificações

## Competências

## Idiomas

## Lacunas conhecidas

## Regras de comunicação
`;

describe("the profile document", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("starts from the template in the interface language", async () => {
    const ctx = await setup();
    const draft = await ctx.draft();
    expect(draft.revision).toBe(0);
    expect(draft.markdown).toContain("## Identidade profissional");
    expect(draft.publishedVersion).toBeNull();
    const english = await ctx.profile.getDraft({
      userId: ctx.user.id,
      language: "en-US",
    });
    expect(english.markdown).toContain("## Professional identity");
  });

  it("saves the draft encrypted, in the canonical layout", async () => {
    const ctx = await setup();
    const saved = await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: "## Identidade profissional\n- Dev\n",
      baseRevision: 0,
    });
    expect(saved.revision).toBe(1);
    expect(saved.findings.some((f) => f.code === "missingSection")).toBe(true);

    const [row] = await ctx.db.select().from(profileDocumentsTable);
    expect(row.encryptedDraft).not.toContain("Dev");
    expect((await ctx.draft()).markdown).toBe(
      "## Identidade profissional\n\n- Dev\n"
    );
  });

  it("refuses a save from a stale revision", async () => {
    const ctx = await setup();
    await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: "a",
      baseRevision: 0,
    });
    await expect(
      ctx.profile.saveDraft({
        userId: ctx.user.id,
        markdown: "b",
        baseRevision: 0,
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("publishes numbered versions and blocks format errors only", async () => {
    const ctx = await setup();
    const { revision } = await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: "## Identidade profissional\n- Dev\n",
      baseRevision: 0,
    });
    await expect(
      ctx.profile.publish({ userId: ctx.user.id, baseRevision: revision })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // A content finding (a figure without a mark) doesn't block.
    const fixed = await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: wellFormed("Dev"),
      baseRevision: revision,
    });
    const first = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: fixed.revision,
    });
    expect(first.number).toBe(1);

    // Publishing an unchanged draft adds nothing.
    const again = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: fixed.revision,
    });
    expect(again).toEqual(first);
    expect((await ctx.draft()).changedSincePublished).toBe(false);

    const next = await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: wellFormed("Dev sênior"),
      baseRevision: fixed.revision,
    });
    expect((await ctx.draft()).changedSincePublished).toBe(true);
    const second = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: next.revision,
    });
    expect(second.number).toBe(2);
    expect(
      (await ctx.profile.listVersions(ctx.user.id)).map((v) => v.number)
    ).toEqual([2, 1]);
  });

  it("restores a version into the draft", async () => {
    const ctx = await setup();
    const saved = await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: wellFormed("Dev"),
      baseRevision: 0,
    });
    const { versionId } = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: saved.revision,
    });
    const edited = await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: wellFormed("Outra coisa"),
      baseRevision: saved.revision,
    });
    await ctx.profile.restoreVersion({
      userId: ctx.user.id,
      profileVersionId: versionId,
      baseRevision: edited.revision,
    });
    expect((await ctx.draft()).markdown).toContain("- Dev\n");
  });

  it("never shows another user's version", async () => {
    const ctx = await setup();
    const saved = await ctx.profile.saveDraft({
      userId: ctx.user.id,
      markdown: wellFormed("Dev"),
      baseRevision: 0,
    });
    const { versionId } = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: saved.revision,
    });
    const other = await createTestUser("grace@example.com");
    await expect(
      ctx.profile.getVersion({ userId: other.id, profileVersionId: versionId })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("adds the occasional level line to an old draft once", async () => {
    const { profile, draft, user } = await setup();
    const old = wellFormed("Dev").replace(
      "## Competências\n",
      "## Competências\n\n- Domino: Python\n- Uso com frequência: SQL\n- Estudei, sem experiência profissional: Spark\n"
    );
    await profile.saveDraft({
      userId: user.id,
      markdown: old,
      baseRevision: 0,
    });
    const first = await draft();
    expect(first.markdown).toContain(
      "- Uso com frequência: SQL\n- Experiência pontual:\n- Estudei"
    );
    expect(first.revision).toBe(2);
    // The user deletes it: it does not come back.
    const without = first.markdown.replace("- Experiência pontual:\n", "");
    await profile.saveDraft({
      userId: user.id,
      markdown: without,
      baseRevision: first.revision,
    });
    const again = await draft();
    expect(again.markdown).toBe(without);
    expect(again.revision).toBe(3);
  });
});
