import { randomBytes } from "node:crypto";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CareerService } from "@repo/api/domains/career/career-service";
import { getUserCipher } from "@repo/api/domains/encryption/user-cipher";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import { ProfileService } from "@repo/api/domains/profile/profile-service";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import { TasksService } from "@repo/api/domains/tasks/tasks-service";
import { createTestUser } from "@repo/api/test/create-test-user";
import {
  clearTestDatabase,
  closeTestDatabase,
  getTestDatabase,
} from "@repo/api/test/pglite";

import { DocumentsRepository } from "../documents-repository";
import { DocumentsService } from "../documents-service";
import { loadCareerContext } from "../generation/load-career-context";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import type { ResumeContent } from "../schemas/resume-content";
import { decryptDocument } from "../snapshot-content";
import { ChangesService } from "./changes-service";
import {
  applyDocumentChange,
  listDocumentParts,
  locateInLines,
} from "./document-change";
import {
  proposeChange,
  proposeSectionMove,
  readChangeContent,
} from "./propose-change";
import type { SectionMove } from "./section-order";

vi.mock("@repo/common/env/web.env", () => ({
  env: {
    ENCRYPTION_MASTER_KEY: `v1:${randomBytes(32).toString("base64")}`,
    ANTHROPIC_API_KEY: "test-key",
  },
}));

const profileMarkdown = `# Profile

## Professional identity

- Professional name: Ada Lovelace
- Platform engineer and tech lead.

## Contact (only what may appear on a resume)

- Professional email: ada@example.com

## Experience (most recent first)

### Globex — Tech Lead (2021-03 to present)

- Responsibilities: Led a team of 5 engineers.
- Tools: Kubernetes, Terraform
- Results:
  - Cut deploy time by 40% with Kubernetes [measured: CI dashboard].

## Education

## Certifications

## Competencies

- I master: Kubernetes, Terraform

## Languages

- English — C1

## Known gaps

## Communication rules
`;

async function setup() {
  const db = await getTestDatabase();
  const user = await createTestUser("ada@example.com");
  const career = new CareerService(db);
  const profile = await career.getOrCreateProfile({
    userId: user.id,
    defaultLanguage: "en-US",
  });
  const cipher = await getUserCipher(db, user.id);
  const tasks = new TasksService(db, {
    trigger: vi.fn(async () => ({ runId: "run", accessToken: "t" })),
  });
  const profiles = new ProfileService(db, tasks);
  const current = await profiles.getDraft({
    userId: user.id,
    language: "en-US",
  });
  const { revision } = await profiles.saveDraft({
    userId: user.id,
    markdown: profileMarkdown,
    baseRevision: current.revision,
  });
  await profiles.publish({ userId: user.id, baseRevision: revision });
  const published = await new ProfileRepository(db).findDocument(
    user.id,
    "profile"
  );
  const context = await loadCareerContext({
    db,
    cipher,
    profileId: profile.id,
    filter: await loadNeverIncludeFilter({ db, cipher, profileId: profile.id }),
  });
  const position = context.positions[0];
  const deploy = context.evidence.find((row) =>
    row.text.includes("Cut deploy time by 40%")
  )!;
  const team = context.evidence.find((row) =>
    row.text.includes("Led a team of 5")
  )!;

  const repository = new DocumentsRepository(db);
  const document = await repository.insertDocument({
    profileId: profile.id,
    kind: "resume",
    encryptedFocus: cipher.encrypt("Platform roles"),
  });
  const version = await repository.insertVersion({
    documentId: document.id,
    language: "en-US",
  });
  const content: ResumeContent = {
    kind: "resume",
    header: {
      name: "Ada Lovelace",
      titleLine: "Platform Engineer | Kubernetes",
      contacts: ["ada@example.com"],
      city: null,
    },
    sections: [
      {
        kind: "summary",
        line: {
          id: "sum1",
          text: "Engineer who cut deploy time by 40%.",
          origin: { kind: "evidence", evidenceIds: [deploy.id] },
        },
      },
      {
        kind: "skills",
        groups: [
          {
            id: "sk1",
            label: "Core",
            text: "Kubernetes, Terraform",
            origin: { kind: "skill", evidenceIds: [] },
          },
        ],
      },
      {
        kind: "experience",
        entries: [
          {
            positionId: position.id,
            employer: position.employer,
            title: position.title,
            startDate: position.startDate,
            endDate: position.endDate,
            context: null,
            lines: [
              {
                id: "exp1",
                text: "Was responsible for cutting deploy time by 40% with Kubernetes.",
                origin: { kind: "evidence", evidenceIds: [deploy.id] },
              },
              {
                id: "exp2",
                text: "Mentored two interns.",
                origin: { kind: "manual" },
              },
            ],
          },
        ],
      },
    ],
  };
  const snapshot = await repository.insertSnapshot({
    versionId: version.id,
    sequence: 1,
    origin: "generated",
    author: "ai",
    encryptedContent: cipher.encrypt(JSON.stringify(content)),
    profileVersionId: published.publishedVersionId!,
  });
  const experience = `experience:${position.id}`;

  const listPending = () => repository.listPendingChanges(version.id);
  const propose = async (
    change: { part: string; find: string; replace: string },
    options: {
      sources?: string[];
      profilePassages?: string[];
      base?: ResumeContent;
      reason?: string;
      requestedBy?: string;
      request?: { said: string[]; latest: string };
      sameTurn?: boolean;
    } = {}
  ) =>
    proposeChange({
      db,
      cipher,
      versionId: version.id,
      snapshotId: snapshot.id,
      content: options.base ?? content,
      origin: "document_agent",
      change,
      reason: options.reason ?? "More direct.",
      profilePassages: options.profilePassages,
      evidence: context.evidence.map((row) => ({ id: row.id, text: row.text })),
      profileText: profileMarkdown,
      sources: options.sources ?? [],
      requestedBy: options.requestedBy,
      request: options.request,
      pending: (await listPending()).map((row) => ({
        id: row.id,
        ...readChangeContent(cipher, row),
      })),
      sameTurnIds: options.sameTurn
        ? new Set((await listPending()).map((row) => row.id))
        : undefined,
    });
  const changes = new ChangesService(db);
  const latest = async () =>
    decryptDocument(cipher, await repository.latestSnapshot(version.id));

  return {
    db,
    user,
    cipher,
    version,
    snapshot,
    content,
    experience,
    position,
    deploy,
    team,
    propose,
    listPending,
    changes,
    latest,
    repository,
  };
}

describe("locateInLines", () => {
  const lines = ["Alpha one.", "Beta two.", "Alpha one."];

  it("finds consecutive lines once, whatever their spacing", () => {
    expect(locateInLines(lines, { find: "Beta   two.", replace: "x" })).toEqual(
      { start: 1, end: 2 }
    );
    expect(
      locateInLines(lines, {
        find: "- Beta two.\n[id3] Alpha one.",
        replace: "",
      })
    ).toEqual({ start: 1, end: 3 });
  });

  it("is stale for lines gone or found twice, and for additions already there", () => {
    expect(locateInLines(lines, { find: "Gamma.", replace: "x" })).toBeNull();
    expect(
      locateInLines(lines, { find: "Alpha one.", replace: "x" })
    ).toBeNull();
    expect(locateInLines(lines, { find: "", replace: "Beta two." })).toBeNull();
    expect(locateInLines(lines, { find: "", replace: "Delta." })).toEqual({
      start: 3,
      end: 3,
    });
  });
});

describe("proposed changes", () => {
  beforeEach(async () => {
    await clearTestDatabase();
  });
  afterAll(async () => {
    await closeTestDatabase();
  });

  it("lists the parts the agent may change", async () => {
    const ctx = await setup();
    expect(listDocumentParts(ctx.content).map((part) => part.key)).toEqual([
      "header",
      "summary",
      "skills",
      `facts:${ctx.position.id}`,
      ctx.experience,
    ]);
    expect(listDocumentParts(ctx.content)[2].lines[0].text).toBe(
      "Core: Kubernetes, Terraform"
    );
    expect(
      listDocumentParts(ctx.content)[0].lines.map((line) => line.text)
    ).toEqual([
      "Ada Lovelace",
      "Platform Engineer | Kubernetes",
      "ada@example.com",
    ]);
  });

  it("proposes a change that waits, encrypted, with the passages it rests on", async () => {
    const ctx = await setup();
    const result = await ctx.propose(
      {
        part: ctx.experience,
        find: "[exp1] Was responsible for cutting deploy time by 40% with Kubernetes.",
        replace: "Cut deploy time by 40% with Kubernetes.",
      },
      {
        profilePassages: [
          "Cut deploy time by 40% with Kubernetes [measured: CI dashboard].",
          "Something the profile never said",
        ],
      }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.change.find).toBe(
      "Was responsible for cutting deploy time by 40% with Kubernetes."
    );
    expect(result.change.evidenceIds).toEqual([ctx.deploy.id]);
    expect(result.unmatchedPassages).toEqual([
      "Something the profile never said",
    ]);
    const [row] = await ctx.listPending();
    expect(row.status).toBe("pending");
    expect(row.snapshotId).toBe(ctx.snapshot.id);
    expect(row.encryptedContent).not.toContain("deploy");
    expect(readChangeContent(ctx.cipher, row).reason).toBe("More direct.");
  });

  it("supersedes a waiting change on the same lines, and the same addition proposed again", async () => {
    const ctx = await setup();
    const first = await ctx.propose({
      part: ctx.experience,
      find: "Mentored two interns.",
      replace: "Mentored two interns to independence.",
    });
    const second = await ctx.propose({
      part: ctx.experience,
      find: "Mentored two interns.",
      replace: "Mentored two interns who now lead features.",
    });
    expect(second.ok && second.supersededIds).toEqual([
      first.ok && first.change.id,
    ]);
    const added = await ctx.propose({
      part: ctx.experience,
      find: "",
      replace: "Ran the on-call rotation.",
    });
    // The same line proposed again (another reason) is one suggestion.
    const addedAgain = await ctx.propose(
      { part: ctx.experience, find: "", replace: "Ran the on-call rotation." },
      { reason: "The opening asks for operations." }
    );
    expect(addedAgain.ok && addedAgain.supersededIds).toEqual([
      added.ok && added.change.id,
    ]);
    const pending = await ctx.listPending();
    expect(pending.map((row) => row.id)).toEqual([
      second.ok && second.change.id,
      addedAgain.ok && addedAgain.change.id,
    ]);
  });

  it("merges a swap proposed as two changes in one turn into one reorder", async () => {
    const ctx = await setup();
    const first =
      "Was responsible for cutting deploy time by 40% with Kubernetes.";
    const second = "Mentored two interns.";
    const a = await ctx.propose({
      part: ctx.experience,
      find: first,
      replace: second,
    });
    const b = await ctx.propose(
      { part: ctx.experience, find: second, replace: first },
      { sameTurn: true }
    );
    if (!a.ok || !b.ok) throw new Error("not proposed");
    expect(b.supersededIds).toEqual([a.change.id]);
    expect(b.change.find).toBe(`${first}\n${second}`);
    expect(b.change.replace).toBe(`${second}\n${first}`);
    expect((await ctx.listPending()).map((row) => row.id)).toEqual([
      b.change.id,
    ]);
    const result = await ctx.changes.acceptChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      baseSnapshotId: ctx.snapshot.id,
    });
    expect(result.accepted).toEqual([b.change.id]);
    const content = await ctx.latest();
    const lines =
      content.kind === "resume" &&
      content.sections[2].kind === "experience" &&
      content.sections[2].entries[0].lines;
    expect(lines && lines.map((line) => line.text)).toEqual([second, first]);
  });

  it("keeps two adjacent changes apart when they don't just reorder, or aren't of the same turn", async () => {
    const ctx = await setup();
    const first =
      "Was responsible for cutting deploy time by 40% with Kubernetes.";
    const a = await ctx.propose({
      part: ctx.experience,
      find: first,
      replace: "Cut deploy time by 40% with Kubernetes.",
    });
    const b = await ctx.propose(
      {
        part: ctx.experience,
        find: "Mentored two interns.",
        replace: "Mentored two interns to independence.",
      },
      { sameTurn: true }
    );
    expect(b.ok && b.supersededIds).toEqual([]);
    expect(a.ok && (await ctx.listPending()).length).toBe(2);
  });

  it("lists a change whose lines are gone as stale, and rejects it", async () => {
    const ctx = await setup();
    const first =
      "Was responsible for cutting deploy time by 40% with Kubernetes.";
    const second = "Mentored two interns.";
    const a = await ctx.propose({
      part: ctx.experience,
      find: first,
      replace: second,
    });
    const b = await ctx.propose({
      part: ctx.experience,
      find: second,
      replace: first,
    });
    const c = await ctx.propose({
      part: "summary",
      find: "Engineer who cut deploy time by 40%.",
      replace: "Platform engineer who cut deploy time by 40%.",
    });
    if (!a.ok || !b.ok || !c.ok) throw new Error("not proposed");
    const listed = async () =>
      (
        await ctx.changes.listChanges({
          userId: ctx.user.id,
          versionId: ctx.version.id,
        })
      ).map((change) => [change.id, change.stale]);
    expect(await listed()).toEqual([
      [a.change.id, false],
      [b.change.id, false],
      [c.change.id, false],
    ]);
    // Accepting the second leaves the first without its line, found twice.
    const result = await ctx.changes.acceptChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      baseSnapshotId: ctx.snapshot.id,
      documentChangeIds: [b.change.id],
    });
    expect(result.accepted).toEqual([b.change.id]);
    // Never dropped: the first stays listed, stale.
    expect(await listed()).toEqual([
      [a.change.id, true],
      [c.change.id, false],
    ]);
    await ctx.changes.rejectChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      documentChangeIds: [a.change.id],
    });
    expect(await listed()).toEqual([[c.change.id, false]]);
  });

  it("locates a waiting change again where its lines moved", async () => {
    const ctx = await setup();
    const first =
      "Was responsible for cutting deploy time by 40% with Kubernetes.";
    const second = "Mentored two interns.";
    const reorder = await ctx.propose({
      part: ctx.experience,
      find: `${first}\n${second}`,
      replace: `${second}\n${first}`,
    });
    const edit = await ctx.propose({
      part: ctx.experience,
      find: second,
      replace: "Mentored two interns to independence.",
    });
    if (!reorder.ok || !edit.ok) throw new Error("not proposed");
    // They overlap, so the edit took the reorder's place: accept it,
    // then a new reorder still finds the lines wherever they are.
    await ctx.changes.acceptChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      baseSnapshotId: ctx.snapshot.id,
    });
    const [other] = await ctx.changes
      .listChanges({
        userId: ctx.user.id,
        versionId: ctx.version.id,
      })
      .then((rows) => rows);
    expect(other).toBeUndefined();
    const content = await ctx.latest();
    if (content.kind !== "resume") throw new Error("not a resume");
    const moved = await ctx.propose(
      {
        part: ctx.experience,
        find: "Mentored two interns to independence.",
        replace: "Mentored two interns to independence at Globex.",
      },
      { base: content }
    );
    expect(moved.ok).toBe(true);
  });

  it("refuses what doesn't apply, changes nothing, touches a locked fact or breaks a fixed part", async () => {
    const ctx = await setup();
    const refusal = async (change: {
      part: string;
      find: string;
      replace: string;
    }) => {
      const result = await ctx.propose(change);
      return result.ok ? null : result.refusal.kind;
    };
    expect(
      await refusal({ part: ctx.experience, find: "Not there.", replace: "x" })
    ).toBe("notFound");
    expect(
      await refusal({ part: "experience:nope", find: "x", replace: "y" })
    ).toBe("noSuchPart");
    expect(
      await refusal({
        part: ctx.experience,
        find: "Mentored two interns.",
        replace: "Mentored two interns.",
      })
    ).toBe("unchanged");
    expect(await refusal({ part: ctx.experience, find: "", replace: "" })).toBe(
      "empty"
    );
    expect(
      await refusal({ part: "header", find: "Ada Lovelace", replace: "Ada L." })
    ).toBe("notRequested");
    expect(await refusal({ part: "education", find: "x", replace: "y" })).toBe(
      "locked"
    );
    expect(
      await refusal({
        part: "skills",
        find: "Core: Kubernetes, Terraform",
        replace: "Platform: Kubernetes, Terraform",
      })
    ).toBe("locked");
    expect(
      await refusal({
        part: "summary",
        find: "Engineer who cut deploy time by 40%.",
        replace: "",
      })
    ).toBe("fixedLines");
    expect(
      await refusal({ part: "skills", find: "", replace: "just a word" })
    ).toBe("fixedLines");
    expect(
      await refusal({
        part: "skills",
        find: "Core: Kubernetes, Terraform",
        replace: "",
      })
    ).toBe("locked");
    expect(await ctx.listPending()).toHaveLength(0);
  });

  it("adds a line at the end of a part, or after an anchor line", async () => {
    const ctx = await setup();
    const appended = await ctx.propose({
      part: ctx.experience,
      find: "",
      replace: "Led a team of 5 engineers.",
    });
    expect(appended.ok).toBe(true);
    const inserted = await ctx.propose({
      part: ctx.experience,
      find: "Was responsible for cutting deploy time by 40% with Kubernetes.",
      replace:
        "Was responsible for cutting deploy time by 40% with Kubernetes.\nLed a team of 5 engineers.",
    });
    expect(inserted.ok).toBe(true);
    if (!appended.ok || !inserted.ok) return;
    const lines = (content: ResumeContent) =>
      content.sections.flatMap((section) =>
        section.kind === "experience"
          ? section.entries[0].lines.map((line) => line.text)
          : []
      );
    const applied = (change: Parameters<typeof applyDocumentChange>[1]) =>
      applyDocumentChange(ctx.content, change, [])!;
    expect(lines(applied(appended.change))).toEqual([
      "Was responsible for cutting deploy time by 40% with Kubernetes.",
      "Mentored two interns.",
      "Led a team of 5 engineers.",
    ]);
    expect(lines(applied(inserted.change))).toEqual([
      "Was responsible for cutting deploy time by 40% with Kubernetes.",
      "Led a team of 5 engineers.",
      "Mentored two interns.",
    ]);
    // The anchor keeps its id; the new line gets one of its own.
    const entry = (
      applied(inserted.change).sections[2] as {
        entries: Array<{ lines: Array<{ id: string }> }>;
      }
    ).entries[0];
    expect(entry.lines[0].id).toBe("exp1");
    expect(entry.lines[1].id).not.toBe("exp2");
    expect(entry.lines[2].id).toBe("exp2");
  });

  it("adds a skills group and appends to the summary, applied on accept", async () => {
    const ctx = await setup();
    const group = await ctx.propose({
      part: "skills",
      find: "",
      replace: "Cloud: AWS, GCP",
    });
    const after = await ctx.propose({
      part: "skills",
      find: "Core: Kubernetes, Terraform",
      replace: "Core: Kubernetes, Terraform\nTools: Git",
    });
    const sentence = await ctx.propose({
      part: "summary",
      find: "",
      replace: "Mentors junior engineers.",
    });
    if (!group.ok || !after.ok || !sentence.ok) throw new Error("refused");
    const result = (change: Parameters<typeof applyDocumentChange>[1]) => {
      const content = applyDocumentChange(ctx.content, change, []);
      if (content?.kind !== "resume") throw new Error("not applied");
      return content.sections;
    };
    const groups = (sections: ReturnType<typeof result>) => {
      const skills = sections.find((section) => section.kind === "skills");
      return skills?.kind === "skills"
        ? skills.groups.map((row) => [row.id, row.label, row.text])
        : [];
    };
    expect(groups(result(group.change))).toEqual([
      ["sk1", "Core", "Kubernetes, Terraform"],
      [expect.any(String), "Cloud", "AWS, GCP"],
    ]);
    expect(groups(result(after.change))[0]).toEqual([
      "sk1",
      "Core",
      "Kubernetes, Terraform",
    ]);
    expect(groups(result(after.change))[1].slice(1)).toEqual(["Tools", "Git"]);
    const summary = result(sentence.change)[0];
    expect(summary.kind === "summary" && summary.line.text).toBe(
      "Engineer who cut deploy time by 40%. Mentors junior engineers."
    );
    const accepted = await ctx.changes.acceptChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      baseSnapshotId: ctx.snapshot.id,
    });
    expect(accepted.accepted).toHaveLength(3);
    const content = await ctx.latest();
    if (content.kind !== "resume") throw new Error("not a resume");
    expect(content.sections[0]).toMatchObject({
      line: { id: "sum1" },
    });
  });

  it("changes a locked fact only when the person asked for it in this conversation", async () => {
    const ctx = await setup();
    const change = {
      part: `facts:${ctx.position.id}`,
      find: ctx.position.title,
      replace: "Staff Engineer",
    };
    const asked = "Change my title at Globex to Staff Engineer";
    // No quote of the person's words: refused.
    const unasked = await ctx.propose(change, {
      request: { said: ["Improve the resume"], latest: "Improve the resume" },
    });
    expect(unasked.ok ? null : unasked.refusal.kind).toBe("notRequested");
    // A quote the person never wrote: refused.
    const invented = await ctx.propose(change, {
      requestedBy: asked,
      request: { said: ["Improve the resume"], latest: "Improve the resume" },
    });
    expect(invented.ok ? null : invented.refusal.kind).toBe("notRequested");
    // Asked earlier, but this turn is about something else: refused.
    const stale = await ctx.propose(change, {
      requestedBy: asked,
      request: {
        said: [asked, "Now shorten the summary"],
        latest: "Now shorten the summary",
      },
    });
    expect(stale.ok ? null : stale.refusal.kind).toBe("notRequested");
    // Asked in this turn, quoted loosely (case and accents aside): accepted.
    const requested = await ctx.propose(change, {
      requestedBy: "change my title at globex to staff engineer",
      request: { said: ["Hi", asked], latest: asked },
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) return;
    const applied = applyDocumentChange(ctx.content, requested.change, [])!;
    expect(
      applied.sections.flatMap((section) =>
        section.kind === "experience"
          ? section.entries.map((entry) => entry.title)
          : []
      )
    ).toEqual(["Staff Engineer"]);
    // The header too, when the latest message is about it.
    const header = await ctx.propose(
      { part: "header", find: "Ada Lovelace", replace: "Ada King Lovelace" },
      {
        requestedBy: "use my full name, Ada King Lovelace",
        request: {
          said: ["Use my full name, Ada King Lovelace."],
          latest: "Use my full name, Ada King Lovelace.",
        },
      }
    );
    expect(header.ok).toBe(true);
    if (!header.ok) return;
    expect(
      applyDocumentChange(ctx.content, header.change, [])!.header.name
    ).toBe("Ada King Lovelace");
  });

  it("refuses a figure found neither in the profile nor in the person's words, and takes one they gave", async () => {
    const ctx = await setup();
    const invented = await ctx.propose({
      part: ctx.experience,
      find: "Mentored two interns.",
      replace: "Mentored two interns, raising their delivery by 35%.",
    });
    expect(!invented.ok && invented.refusal).toEqual({
      kind: "ungivenFigures",
      figures: ["35%"],
    });
    const told = await ctx.propose(
      {
        part: ctx.experience,
        find: "Mentored two interns.",
        replace: "Mentored two interns, raising their delivery by 35%.",
      },
      { sources: ["Their delivery went up 35 percent, add that."] }
    );
    expect(told.ok).toBe(true);
    // A figure of the profile passes without the person repeating it.
    const fromProfile = await ctx.propose({
      part: "summary",
      find: "Engineer who cut deploy time by 40%.",
      replace: "Tech lead of 5 engineers who cut deploy time by 40%.",
    });
    expect(fromProfile.ok).toBe(true);
  });

  it("accepts a change as a snapshot authored by the AI, with the lines traced to the passages", async () => {
    const ctx = await setup();
    const proposed = await ctx.propose(
      {
        part: ctx.experience,
        find: "Was responsible for cutting deploy time by 40% with Kubernetes.",
        replace: "Cut deploy time by 40% with Kubernetes.",
      },
      {
        profilePassages: [
          "Cut deploy time by 40% with Kubernetes [measured: CI dashboard].",
        ],
      }
    );
    if (!proposed.ok) throw new Error("not proposed");
    const result = await ctx.changes.acceptChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      baseSnapshotId: ctx.snapshot.id,
      documentChangeIds: [proposed.change.id],
    });
    expect(result.accepted).toEqual([proposed.change.id]);
    expect(result.skipped).toEqual([]);
    const snapshot = await ctx.repository.latestSnapshot(ctx.version.id);
    expect(snapshot.id).toBe(result.snapshotId);
    expect(snapshot.sequence).toBe(2);
    expect(snapshot.origin).toBe("suggested");
    expect(snapshot.author).toBe("ai");
    expect(snapshot.parentSnapshotId).toBe(ctx.snapshot.id);
    expect(snapshot.profileVersionId).toBe(ctx.snapshot.profileVersionId);
    const content = await ctx.latest();
    const entry = content.kind === "resume" && content.sections[2];
    expect(
      entry && entry.kind === "experience" && entry.entries[0].lines
    ).toEqual([
      {
        id: "exp1",
        text: "Cut deploy time by 40% with Kubernetes.",
        origin: { kind: "evidence", evidenceIds: [ctx.deploy.id] },
      },
      { id: "exp2", text: "Mentored two interns.", origin: { kind: "manual" } },
    ]);
    expect(await ctx.listPending()).toHaveLength(0);
    expect(
      await ctx.changes.listChanges({
        userId: ctx.user.id,
        versionId: ctx.version.id,
      })
    ).toEqual([]);
  });

  it("accepts all waiting changes one snapshot each, skipping those whose lines were edited away", async () => {
    const ctx = await setup();
    const stale = await ctx.propose({
      part: ctx.experience,
      find: "Mentored two interns.",
      replace: "Mentored two interns to independence.",
    });
    const summary = await ctx.propose({
      part: "summary",
      find: "Engineer who cut deploy time by 40%.",
      replace: "Platform engineer who cut deploy time by 40%.",
    });
    const added = await ctx.propose(
      {
        part: ctx.experience,
        find: "",
        replace: "Ran the on-call rotation for 5 engineers.",
      },
      { profilePassages: ["Led a team of 5 engineers."] }
    );
    if (!stale.ok || !summary.ok || !added.ok) throw new Error("not proposed");
    // The person edits the line the first change rewrites.
    const edited = await new DocumentsService(ctx.db).saveEdit({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      baseSnapshotId: ctx.snapshot.id,
      content: applyDocumentChange(ctx.content, {
        part: ctx.experience,
        find: "Mentored two interns.",
        replace: "Mentored three interns.",
      })!,
    });
    const result = await ctx.changes.acceptChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      baseSnapshotId: edited.snapshotId,
    });
    expect(result.accepted).toEqual([summary.change.id, added.change.id]);
    expect(result.skipped).toEqual([stale.change.id]);
    const history = await ctx.repository.listSnapshots(ctx.version.id);
    expect(
      history.map((row) => [row.sequence, row.origin, row.author])
    ).toEqual(
      expect.arrayContaining([
        [2, "edited", "user"],
        [3, "suggested", "ai"],
        [4, "suggested", "ai"],
      ])
    );
    const content = await ctx.latest();
    if (content.kind !== "resume") throw new Error("not a resume");
    const [summarySection, , experience] = content.sections;
    expect(summarySection.kind === "summary" && summarySection.line.text).toBe(
      "Platform engineer who cut deploy time by 40%."
    );
    const lines =
      experience.kind === "experience" && experience.entries[0].lines;
    expect(lines && lines.map((line) => line.text)).toEqual([
      "Was responsible for cutting deploy time by 40% with Kubernetes.",
      "Mentored three interns.",
      "Ran the on-call rotation for 5 engineers.",
    ]);
    expect(lines && lines[2].origin).toEqual({
      kind: "evidence",
      evidenceIds: [ctx.team.id],
    });
    // The stale one still waits: only a rejection ends it.
    expect((await ctx.listPending()).map((row) => row.id)).toEqual([
      stale.change.id,
    ]);
    const rejected = await ctx.changes.rejectChanges({
      userId: ctx.user.id,
      versionId: ctx.version.id,
      documentChangeIds: [stale.change.id],
    });
    expect(rejected.rejected).toEqual([stale.change.id]);
    expect(await ctx.listPending()).toHaveLength(0);
    expect(
      (await ctx.repository.listRejectedChanges(ctx.version.id, 5)).map(
        (row) => row.id
      )
    ).toEqual([stale.change.id]);
  });

  it("refuses to accept over a snapshot that isn't the official one, and another user's version", async () => {
    const ctx = await setup();
    await expect(
      ctx.changes.acceptChanges({
        userId: ctx.user.id,
        versionId: ctx.version.id,
        baseSnapshotId: crypto.randomUUID(),
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const other = await createTestUser("bob@example.com");
    await expect(
      ctx.changes.listChanges({ userId: other.id, versionId: ctx.version.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("writes a cover letter's paragraphs with the letter's trace", async () => {
    const ctx = await setup();
    const letter: CoverLetterContent = {
      kind: "cover_letter",
      header: ctx.content.header,
      greeting: "Dear hiring team,",
      paragraphs: [
        {
          id: "par1",
          text: "At Globex I was in charge of deploys.",
          origin: {
            kind: "letter",
            evidenceIds: [],
            companyFactIds: [],
            motivationPointIds: [],
            instructionIds: [],
          },
        },
      ],
      closing: "Best regards,",
    };
    const next = applyDocumentChange(
      letter,
      {
        part: "letter",
        find: "At Globex I was in charge of deploys.",
        replace: "At Globex I cut deploy time by 40% with Kubernetes.",
      },
      [ctx.deploy.id]
    );
    expect(next?.kind === "cover_letter" && next.paragraphs[0]).toEqual({
      id: "par1",
      text: "At Globex I cut deploy time by 40% with Kubernetes.",
      origin: {
        kind: "letter",
        evidenceIds: [ctx.deploy.id],
        companyFactIds: [],
        motivationPointIds: [],
        instructionIds: [],
      },
    });
    const added = applyDocumentChange(letter, {
      part: "letter",
      find: "",
      replace: "I would be glad to talk.",
    });
    expect(
      added?.kind === "cover_letter" &&
        added.paragraphs.map((line) => line.text)
    ).toEqual([
      "At Globex I was in charge of deploys.",
      "I would be glad to talk.",
    ]);
  });

  describe("section moves", () => {
    const kindsOf = (
      content: ResumeContent | CoverLetterContent | { kind: string }
    ) =>
      "sections" in content
        ? content.sections.map((section) => section.kind)
        : [];
    const proposeMove = (
      ctx: Awaited<ReturnType<typeof setup>>,
      move: SectionMove
    ) =>
      proposeSectionMove({
        db: ctx.db,
        cipher: ctx.cipher,
        versionId: ctx.version.id,
        snapshotId: ctx.snapshot.id,
        content: ctx.content,
        origin: "document_agent",
        move,
        reason: "Your experience reads stronger first.",
      });

    it("suggests a move, written to the snapshot only when accepted", async () => {
      const ctx = await setup();
      const move = await proposeMove(ctx, {
        kind: "experience",
        placement: "above",
        anchor: "skills",
      });
      if (!move.ok) throw new Error("not proposed");
      expect(await ctx.listPending()).toHaveLength(1);
      expect(kindsOf(await ctx.latest())).toEqual([
        "summary",
        "skills",
        "experience",
      ]);
      const listed = await ctx.changes.listChanges({
        userId: ctx.user.id,
        versionId: ctx.version.id,
      });
      expect(listed.map((change) => change.stale)).toEqual([false]);

      const result = await ctx.changes.acceptChanges({
        userId: ctx.user.id,
        versionId: ctx.version.id,
        baseSnapshotId: ctx.snapshot.id,
      });
      expect(result.accepted).toEqual([move.change.id]);
      const content = await ctx.latest();
      expect(kindsOf(content)).toEqual(["summary", "experience", "skills"]);
      // The section moves with its content.
      expect(
        content.kind === "resume" && content.sections[1].kind === "experience"
          ? content.sections[1].entries[0].lines.length
          : 0
      ).toBe(2);
      expect(await ctx.listPending()).toHaveLength(0);
    });

    it("leaves the order alone when the suggestion is rejected", async () => {
      const ctx = await setup();
      const move = await proposeMove(ctx, {
        kind: "skills",
        placement: "below",
        anchor: "experience",
      });
      if (!move.ok) throw new Error("not proposed");
      await ctx.changes.rejectChanges({
        userId: ctx.user.id,
        versionId: ctx.version.id,
        documentChangeIds: [move.change.id],
      });
      expect(await ctx.listPending()).toHaveLength(0);
      expect(kindsOf(await ctx.latest())).toEqual([
        "summary",
        "skills",
        "experience",
      ]);
    });

    it("refuses a move to where the section already sits or to a section that isn't printed", async () => {
      const ctx = await setup();
      const same = await proposeMove(ctx, {
        kind: "skills",
        placement: "below",
        anchor: "summary",
      });
      expect(same).toEqual({ ok: false, refusal: { kind: "unchanged" } });
      const missing = await proposeMove(ctx, {
        kind: "projects",
        placement: "above",
        anchor: "experience",
      });
      expect(missing).toEqual({ ok: false, refusal: { kind: "noSuchPart" } });
    });

    it("replaces a waiting move of the same section", async () => {
      const ctx = await setup();
      const first = await proposeMove(ctx, {
        kind: "experience",
        placement: "above",
        anchor: "skills",
      });
      const second = await proposeMove(ctx, {
        kind: "experience",
        placement: "above",
        anchor: "summary",
      });
      if (!first.ok || !second.ok) throw new Error("not proposed");
      expect(second.supersededIds).toEqual([]);
      const again = await proposeSectionMove({
        db: ctx.db,
        cipher: ctx.cipher,
        versionId: ctx.version.id,
        snapshotId: ctx.snapshot.id,
        content: ctx.content,
        origin: "document_agent",
        move: { kind: "experience", placement: "above", anchor: "summary" },
        reason: "Again.",
        pending: (await ctx.listPending()).map((row) => ({
          id: row.id,
          ...readChangeContent(ctx.cipher, row),
        })),
      });
      if (!again.ok) throw new Error("not proposed");
      expect(again.supersededIds).toHaveLength(2);
    });

    it("is stale once the section sits there already", async () => {
      const ctx = await setup();
      const move = await proposeMove(ctx, {
        kind: "experience",
        placement: "above",
        anchor: "skills",
      });
      if (!move.ok) throw new Error("not proposed");
      const moved = applyDocumentChange(ctx.content, move.change);
      expect(moved).not.toBeNull();
      expect(applyDocumentChange(moved!, move.change)).toBeNull();
    });
  });
});
