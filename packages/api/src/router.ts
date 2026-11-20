import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createTRPCRouter } from "./tools/trpc";
import { trackerRouter } from "./domains/applications/tracker/tracker-router";
import { instructionsRouter } from "./domains/applications/instructions-router";
import { motivationRouter } from "./domains/applications/motivation/motivation-router";
import { researchRouter } from "./domains/applications/research/research-router";
import { accountRouter } from "./domains/account/account-router";
import { aiKeysRouter } from "./domains/ai/ai-keys-router";
import { billingRouter } from "./domains/billing/billing-router";
import { careerRouter } from "./domains/career/career-router";
import { adaptationRouter } from "./domains/documents/adaptation/adaptation-router";
import { creditsRouter } from "./domains/credits/credits-router";
import { documentsRouter } from "./domains/documents/documents-router";
import { letterRouter } from "./domains/documents/letter/letter-router";
import { linkedinInterviewRouter } from "./domains/documents/linkedin/linkedin-interview-router";
import { linkedinRouter } from "./domains/documents/linkedin/linkedin-router";
import { libraryRouter } from "./domains/documents/library/library-router";
import { writingRouter } from "./domains/documents/writing/writing-router";
import { profileRouter } from "./domains/profile/profile-router";
import { openingsRouter } from "./domains/openings/openings-router";
import { tasksRouter } from "./domains/tasks/tasks-router";
import { usersRouter } from "./domains/users/users-router";

export const appRouter = createTRPCRouter({
  account: accountRouter,
  adaptation: adaptationRouter,
  aiKeys: aiKeysRouter,
  billing: billingRouter,
  career: careerRouter,
  credits: creditsRouter,
  documents: documentsRouter,
  instructions: instructionsRouter,
  letters: letterRouter,
  linkedin: linkedinRouter,
  linkedinInterview: linkedinInterviewRouter,
  library: libraryRouter,
  motivation: motivationRouter,
  openings: openingsRouter,
  profile: profileRouter,
  research: researchRouter,
  tasks: tasksRouter,
  tracker: trackerRouter,
  users: usersRouter,
  writing: writingRouter,
});

export type AppRouter = typeof appRouter;

export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
