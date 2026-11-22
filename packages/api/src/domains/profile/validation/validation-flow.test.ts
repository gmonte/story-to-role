import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createAiClient } from "@repo/api/domains/ai/ai-client";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import { fakeEmbedder } from "@repo/api/test/fake-embedder";
import { fakeProviderPackage } from "@repo/api/test/fake-provider-package";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import {
  profileExtractsTable,
  profilePassagesTable,
  profileVersionsTable,
} from "../db/profile-tables";
import { embedProfileVersion } from "../embed-profile-version";
import { loadPublishedProfile } from "../load-published-profile";
import { ProfileService } from "../profile-service";
import { runValidateProfile } from "./run-validate-profile";

vi.mock("@repo/common/env/web.env", () => ({
  env: { ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}` },
}));

const profileText = (results: string) => `# Perfil

## Identidade profissional

- Dev backend.

## Contato (só o que pode aparecer no currículo)

## Experiência (mais recente primeiro)

### Beta — Backend (2022-03 a atual)

- Tecnologias: Python
- Resultados: ${results}
- O que NÃO fiz: não liderei pessoas.

## Formação

## Certificações

## Competências

- Uso com frequência: Python

## Idiomas

## Lacunas conhecidas

## Regras de comunicação
`;

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser();
  const trigger = {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "token" })),
  };
  const profile = new ProfileService(db, new TasksService(db, trigger));
  const save = async (markdown: string, baseRevision: number) =>
    (await profile.saveDraft({ userId: user.id, markdown, baseRevision }))
      .revision;
  return { db, user, trigger, profile, save };
}

describe("validating and publishing the profile", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase();
  });

  it("charges by the parts that changed and refuses when nothing did", async () => {
    const ctx = await setup();
    const revision = await ctx.save(profileText("reduzi custos [medido]."), 0);
    const estimate = await ctx.profile.validationEstimate(ctx.user.id);
    expect(estimate.parts).toEqual(
      [
        "Identidade profissional",
        "Beta — Backend (2022-03 a atual)",
        "Competências",
        "Regras de comunicação",
      ].filter((title) => title !== "Regras de comunicação")
    );
    expect(estimate.credits).toBeGreaterThan(0);
    // The cap follows the profile's size: the whole profile is read.
    const { creditCap } =
      await import("@repo/api/domains/credits/credit-pricing");
    expect(
      creditCap("validate_profile", { parts: 1, profileCharacters: 200_000 })
    ).toBeGreaterThan(
      creditCap("validate_profile", { parts: 1, profileCharacters: 20_000 })
    );

    const { profileValidationId } = await ctx.profile.validate({
      userId: ctx.user.id,
      baseRevision: revision,
    });
    expect(ctx.trigger.trigger).toHaveBeenCalledWith(
      "validate_profile",
      expect.anything()
    );
    expect(profileValidationId).toBeTruthy();

    await ctx.profile.publish({ userId: ctx.user.id, baseRevision: revision });
    await expect(
      ctx.profile.validate({ userId: ctx.user.id, baseRevision: revision })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("keeps only findings quoted from the profile and proposes new levels", async () => {
    const ctx = await setup();
    const revision = await ctx.save(profileText("melhorei a entrega."), 0);
    const { profileValidationId } = await ctx.profile.validate({
      userId: ctx.user.id,
      baseRevision: revision,
    });
    const { providerPackage } = fakeProviderPackage({
      object: () => ({
        findings: [
          {
            kind: "noImpact",
            quote: "melhorei a entrega",
            message: "O que mudou?",
          },
          {
            kind: "unknown",
            quote: "liderei 40 pessoas",
            message: "Inventado",
          },
        ],
        competencies: [
          { name: "Python", level: "often", reason: "já está" },
          { name: "Python", level: "master", reason: "anos de uso" },
        ],
      }),
    });
    const ai = createAiClient({
      db: ctx.db,
      userId: ctx.user.id,
      funding: "credits",
      providerPackage,
    });
    const report = await runValidateProfile({
      db: ctx.db,
      ai,
      cipher: await getUserCipher(ctx.db, ctx.user.id),
      userId: ctx.user.id,
      profileValidationId,
      reportProgress: vi.fn(),
    });
    expect(report.findings).toEqual([
      {
        kind: "noImpact",
        quote: "melhorei a entrega",
        message: "O que mudou?",
      },
    ]);
    expect(report.competencies).toEqual([
      {
        name: "Python",
        level: "master",
        current: "often",
        reason: "anos de uso",
      },
    ]);

    const latest = await ctx.profile.latestValidation(ctx.user.id);
    expect(latest?.status).toBe("completed");
    expect(latest?.report?.findings).toHaveLength(1);

    // Published right after, the version counts as validated.
    const { versionId } = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: revision,
    });
    const [version] = await ctx.db
      .select()
      .from(profileVersionsTable)
      .where(eq(profileVersionsTable.id, versionId));
    expect(version.validatedAt).not.toBeNull();
  });

  it("levels competencies across the whole profile, not only what changed", async () => {
    const ctx = await setup();
    const first = await ctx.save(profileText("reduzi custos [medido]."), 0);
    await ctx.profile.publish({ userId: ctx.user.id, baseRevision: first });
    const revision = await ctx.save(
      profileText("reduzi custos [medido].").replace(
        "### Beta — Backend",
        [
          "### Gama — Backend (2026-10 a atual)",
          "",
          "- Tecnologias: Python",
          "- Resultados: um projeto de poucos dias.",
          "- O que NÃO fiz: não liderei pessoas.",
          "",
          "### Beta — Backend",
        ].join("\n")
      ),
      first
    );
    const { profileValidationId } = await ctx.profile.validate({
      userId: ctx.user.id,
      baseRevision: revision,
    });
    const { providerPackage, generateObject } = fakeProviderPackage({
      object: () => ({ findings: [], competencies: [] }),
    });
    await runValidateProfile({
      db: ctx.db,
      ai: createAiClient({
        db: ctx.db,
        userId: ctx.user.id,
        funding: "credits",
        providerPackage,
      }),
      cipher: await getUserCipher(ctx.db, ctx.user.id),
      userId: ctx.user.id,
      profileValidationId,
      reportProgress: vi.fn(),
    });
    const prompt = JSON.stringify(generateObject.mock.calls[0][0]);
    // The unchanged experience is there to judge Python's level by...
    expect(prompt).toContain("reduzi custos [medido].");
    // ...while only the changed one is under review.
    expect(prompt).toMatch(/under review[^<]*Gama — Backend/);
    expect(prompt).not.toMatch(/under review[^<]*Beta — Backend/);
  });

  it("stores the extract and passages of each version and embeds them", async () => {
    const ctx = await setup();
    const revision = await ctx.save(profileText("reduzi custos [medido]."), 0);
    const { versionId } = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: revision,
    });
    expect(ctx.trigger.trigger).toHaveBeenCalledWith(
      "embed_profile",
      expect.anything()
    );
    const [extract] = await ctx.db
      .select()
      .from(profileExtractsTable)
      .where(eq(profileExtractsTable.versionId, versionId));
    expect(extract.encryptedContent).not.toContain("Beta");
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    expect(JSON.parse(cipher.decrypt(extract.encryptedContent))).toMatchObject({
      experiences: [{ company: "Beta", title: "Backend", end: "present" }],
    });

    await embedProfileVersion({
      db: ctx.db,
      cipher,
      embedder: fakeEmbedder,
      profileVersionId: versionId,
    });
    const passages = await ctx.db
      .select()
      .from(profilePassagesTable)
      .where(eq(profilePassagesTable.versionId, versionId));
    expect(passages.length).toBeGreaterThan(2);
    expect(passages.every((passage) => passage.embedding)).toBe(true);

    const loaded = await loadPublishedProfile({
      db: ctx.db,
      cipher,
      userId: ctx.user.id,
    });
    expect(loaded?.number).toBe(1);
    expect(loaded?.extract.experiences[0].company).toBe("Beta");
    expect(loaded?.passages.length).toBe(passages.length);
  });

  it("embeds again only the passages that changed", async () => {
    const ctx = await setup();
    const cipher = await getUserCipher(ctx.db, ctx.user.id);
    const first = await ctx.save(profileText("reduzi custos [medido]."), 0);
    const v1 = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: first,
    });
    await embedProfileVersion({
      db: ctx.db,
      cipher,
      embedder: fakeEmbedder,
      profileVersionId: v1.versionId,
    });
    const second = await ctx.save(
      profileText("reduzi custos em 10% [medido]."),
      first
    );
    const v2 = await ctx.profile.publish({
      userId: ctx.user.id,
      baseRevision: second,
    });
    const passages = await ctx.db
      .select()
      .from(profilePassagesTable)
      .where(eq(profilePassagesTable.versionId, v2.versionId));
    const missing = passages.filter((passage) => !passage.embedding);
    expect(missing.map((p) => cipher.decrypt(p.encryptedText))).toEqual([
      "Beta — Backend (2022-03 a atual): Resultados: reduzi custos em 10% [medido].",
    ]);
  });
});
