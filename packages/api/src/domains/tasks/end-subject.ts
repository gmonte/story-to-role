import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import { DocumentsRepository } from "@repo/api/domains/documents/documents-repository";
import { LinkedinInterviewRepository } from "@repo/api/domains/documents/linkedin/linkedin-interview-repository";
import { OpeningsRepository } from "@repo/api/domains/openings/openings-repository";
import { ProfileRepository } from "@repo/api/domains/profile/profile-repository";
import type { DbClient } from "@repo/api/tools/db-client";

import type { TaskType } from "./schemas/task";

type EndSubject = (db: DbClient, subjectId: string) => Promise<void>;

const failGeneration: EndSubject = (db, generationId) =>
  new DocumentsRepository(db).updateGeneration(generationId, {
    status: "failed",
    finishedAt: new Date(),
  });

/**
 * What each task's own failure handling does to the row it works on, for
 * a run that died before it could (a crash, a deploy): so the page
 * following that row shows the failure, never work still going. Tasks
 * missing here keep no state of their own: their pages read the task.
 */
const endSubjectOf: Partial<Record<TaskType, EndSubject>> = {
  analyze_opening: (db, openingId) =>
    new OpeningsRepository(db).failAnalysis(openingId),
  generate_document: failGeneration,
  adapt_document: failGeneration,
  split_instructions: (db, applicationInstructionsId) =>
    new InstructionsRepository(db).updateInstructions(
      applicationInstructionsId,
      { status: "failed" }
    ),
  research_company: (db, researchId) =>
    new ResearchRepository(db).setResearchStatus(researchId, "failed"),
  motivation_turn: (db, interviewId) =>
    new MotivationRepository(db).updateInterview(interviewId, {
      status: "failed",
    }),
  linkedin_turn: (db, interviewId) =>
    new LinkedinInterviewRepository(db).updateInterview(interviewId, {
      status: "failed",
    }),
  validate_profile: (db, profileValidationId) =>
    new ProfileRepository(db).updateValidation(profileValidationId, {
      status: "failed",
      completedAt: new Date(),
    }),
  import_document: (db, sourceDocumentId) =>
    new CareerRepository(db).updateDocument(sourceDocumentId, {
      importStatus: "failed",
    }),
};

/** Ends the row a dead task worked on, as its run would have. */
export async function endSubject(
  db: DbClient,
  task: { type: TaskType; subjectId: string | null }
) {
  if (!task.subjectId) return;
  await endSubjectOf[task.type]?.(db, task.subjectId);
}
