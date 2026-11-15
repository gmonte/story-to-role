import { z } from "zod";

import type { AiClient } from "@repo/api/domains/ai/ai-client";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { EvidenceRepository } from "@repo/api/domains/evidence/evidence-repository";
import { loadSensitiveFilter } from "@repo/api/domains/evidence/sensitive/load-sensitive-filter";
import {
  ForbiddenTermError,
  type SensitiveFilter,
} from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import { CareerRepository } from "./career-repository";

type Deps = { db: DbClient; ai: AiClient; cipher: UserCipher };

/**
 * Asks for a text and rejects any output that still carries a generalized or
 * excluded original (sensitive-data control): one regeneration, then fail.
 */
async function writeClean(
  filter: SensitiveFilter,
  write: () => Promise<string>
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await write();
    if (filter.findForbiddenTerms(text).length === 0) return text;
  }
  throw new ForbiddenTermError(1);
}

async function approvedFacts(
  deps: Deps,
  profileId: string,
  filter: SensitiveFilter,
  positionId?: string
) {
  const evidence = new EvidenceRepository(deps.db);
  const [evidenceRows, stories] = await Promise.all([
    evidence.listEvidence(profileId),
    evidence.listStories(profileId),
  ]);
  const facts = [
    ...evidenceRows
      .filter((row) => !positionId || row.positionId === positionId)
      .map((row) => `${row.kind}: ${deps.cipher.decrypt(row.encryptedText)}`),
    ...stories
      .filter((row) => !positionId || row.positionId === positionId)
      .map(
        (row) =>
          `story: problem: ${deps.cipher.decrypt(row.encryptedProblem)}; action: ${deps.cipher.decrypt(row.encryptedAction)}; result: ${deps.cipher.decrypt(row.encryptedResult)}`
      ),
  ];
  // Facts that make no sense without an excluded item are left out.
  return filter.dropFactsMentioningExcluded(facts);
}

/**
 * The 150–300-word summary of an approved position: what neighbouring
 * positions and the orchestrator see instead of its transcript.
 */
export async function runSummarizePosition(
  deps: Deps & { profileId: string; positionId: string }
) {
  const career = new CareerRepository(deps.db);
  const position = await career.findPosition({
    profileId: deps.profileId,
    positionId: deps.positionId,
  });
  if (!position) throw new Error(`Position ${deps.positionId} not found`);

  const filter = await loadSensitiveFilter(deps);
  const facts = await approvedFacts(deps, deps.profileId, filter, position.id);
  const title = deps.cipher.decrypt(position.encryptedTitle);
  const employer = deps.cipher.decrypt(position.encryptedEmployer);

  const summary = await writeClean(filter, async () => {
    const { text } = await deps.ai.generateText({
      purpose: "position_summary",
      role: "writing",
      // Thinking counts toward the limit: leave room beyond the 300 words.
      maxTokens: 4096,
      system: [
        "Summarize one position of the user's career in 150 to 300 words, in the third person, using only the approved facts below. Add nothing that is not in them.",
        `Position: ${title} at ${employer} (${position.startDate ?? "?"} to ${position.endDate ?? "present"}).`,
        "Approved facts:",
        ...facts.map((fact) => `- ${fact}`),
      ].join("\n"),
      messages: [{ role: "user", content: "Write the summary." }],
    });
    return text;
  });

  const latest = await career.latestSummaries([position.id]);
  await career.insertSummary({
    positionId: position.id,
    encryptedSummary: deps.cipher.encrypt(summary),
    version: (latest[0]?.version ?? 0) + 1,
  });
}

const narrativeSchema = z.object({
  text: z.string(),
  themes: z.array(z.string()).max(6),
});

/**
 * The career narrative: links between positions, drafted from approved
 * summaries and the timeline only, for the user to approve.
 */
export async function runDraftNarrative(deps: Deps & { profileId: string }) {
  const career = new CareerRepository(deps.db);
  const positions = (await career.listPositions(deps.profileId)).filter(
    (row) => row.status === "approved"
  );
  const summaries = await career.latestSummaries(
    positions.map((row) => row.id)
  );
  const filter = await loadSensitiveFilter(deps);

  const timeline = positions
    .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))
    .map((row) => {
      const summary = summaries.find((s) => s.positionId === row.id);
      return `- ${deps.cipher.decrypt(row.encryptedTitle)} at ${deps.cipher.decrypt(row.encryptedEmployer)} (${row.startDate ?? "?"} to ${row.endDate ?? "present"}): ${summary ? deps.cipher.decrypt(summary.encryptedSummary) : "no summary yet"}`;
    });

  let draft: z.infer<typeof narrativeSchema> | null = null;
  await writeClean(filter, async () => {
    const { object } = await deps.ai.generateObject({
      purpose: "career_narrative",
      role: "writing",
      maxTokens: 4096,
      schema: narrativeSchema,
      system: [
        "Draft the narrative that links the user's positions: how each led to the next, the threads that run through the career and the themes it shows. Use only the summaries below and invent nothing. Write in the third person, 150 to 300 words, plus up to six short themes.",
        "Career (oldest first):",
        ...timeline,
      ].join("\n"),
      messages: [{ role: "user", content: "Draft the narrative." }],
    });
    draft = object;
    return object ? `${object.text}\n${object.themes.join("\n")}` : "";
  });
  if (!draft) throw new Error("The narrative could not be drafted");
  const narrative = draft as z.infer<typeof narrativeSchema>;

  const latest = await career.latestNarrative(deps.profileId);
  await career.insertNarrative({
    profileId: deps.profileId,
    encryptedText: deps.cipher.encrypt(narrative.text),
    encryptedThemes: deps.cipher.encrypt(JSON.stringify(narrative.themes)),
    version: (latest?.version ?? 0) + 1,
  });
}
