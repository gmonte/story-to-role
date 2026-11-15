import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createTRPCRouter } from "./tools/trpc";
import { instructionsRouter } from "./domains/applications/instructions-router";
import { motivationRouter } from "./domains/applications/motivation/motivation-router";
import { researchRouter } from "./domains/applications/research/research-router";
import { careerRouter } from "./domains/career/career-router";
import { adaptationRouter } from "./domains/documents/adaptation/adaptation-router";
import { chatRouter } from "./domains/chat/chat-router";
import { documentsRouter } from "./domains/documents/documents-router";
import { letterRouter } from "./domains/documents/letter/letter-router";
import { libraryRouter } from "./domains/documents/library/library-router";
import { writingRouter } from "./domains/documents/writing/writing-router";
import { interviewRouter } from "./domains/interview/interview-router";
import { openingsRouter } from "./domains/openings/openings-router";
import { tasksRouter } from "./domains/tasks/tasks-router";
import { usersRouter } from "./domains/users/users-router";

export const appRouter = createTRPCRouter({
  adaptation: adaptationRouter,
  career: careerRouter,
  chat: chatRouter,
  documents: documentsRouter,
  instructions: instructionsRouter,
  interview: interviewRouter,
  letters: letterRouter,
  library: libraryRouter,
  motivation: motivationRouter,
  openings: openingsRouter,
  research: researchRouter,
  tasks: tasksRouter,
  users: usersRouter,
  writing: writingRouter,
});

export type AppRouter = typeof appRouter;

export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
