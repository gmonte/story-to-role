import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { draftsFingerprint } from "./drafts-fingerprint";
import { InterviewRepository } from "./interview-repository";

const languageNames = { "en-US": "English", "pt-BR": "Brazilian Portuguese" };

type DraftPayload = {
  text?: string;
  problem?: string;
  action?: string;
  result?: string;
};

/**
 * "What the AI understood" about one session before the user approves it: a
 * few sentences in the interviewer's voice, from the session's drafts only,
 * stored encrypted with how many drafts it covered.
 */
export async function runUnderstandSession(deps: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  userId: string;
  sessionId: string;
}) {
  const { db, cipher } = deps;
  const interview = new InterviewRepository(db);
  const career = new CareerRepository(db);
  const session = await interview.findSessionById(deps.sessionId);
  const profile = session && (await career.findProfileById(session.profileId));
  // The task acts for its creator only.
  if (!session || profile?.userId !== deps.userId) {
    throw new Error(`Session ${deps.sessionId} isn't the user's`);
  }

  const drafts = (await interview.listDrafts(session.id)).filter(
    (draft) => draft.status === "draft"
  );
  const facts = drafts.map((draft) => {
    const payload = JSON.parse(
      cipher.decrypt(draft.encryptedPayload)
    ) as DraftPayload;
    const text =
      payload.text ??
      [payload.problem, payload.action, payload.result]
        .filter(Boolean)
        .join(" ");
    return `- ${draft.kind}: ${text}`;
  });

  let subject = "the user's career in general";
  if (session.positionId) {
    const position = await career.findPosition({
      profileId: session.profileId,
      positionId: session.positionId,
    });
    if (position) {
      subject = `their time as ${cipher.decrypt(position.encryptedTitle)} at ${cipher.decrypt(position.encryptedEmployer)}`;
    }
  } else if (session.credentialId) {
    const credential = await career.findCredential({
      profileId: session.profileId,
      credentialId: session.credentialId,
    });
    if (credential) {
      subject = `the story behind ${cipher.decrypt(credential.encryptedTitle)}`;
    }
  }

  const { text } = await deps.ai.generateText({
    purpose: "session_understanding",
    role: "writing",
    maxTokens: 2048,
    system: [
      `In 2 to 4 sentences, as the interviewer talking to the user ("you"), say what you understood about ${subject}, using only the facts below. Add nothing that is not in them, and say plainly when something important (a number, the scale, the outcome) is still missing.`,
      `Write in ${languageNames[profile.interviewLanguage]}, in plain text without Markdown.`,
      "Facts:",
      ...facts,
    ].join("\n"),
    messages: [{ role: "user", content: "What did you understand?" }],
  });

  await interview.updateSession(session.id, {
    encryptedUnderstanding: cipher.encrypt(text.trim()),
    understandingFingerprint: draftsFingerprint(drafts),
  });
}
