import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createTRPCRouter } from "./tools/trpc";
import { instructionsRouter } from "./domains/applications/instructions-router";
import { careerRouter } from "./domains/career/career-router";
import { adaptationRouter } from "./domains/documents/adaptation/adaptation-router";
import { chatRouter } from "./domains/chat/chat-router";
import { documentsRouter } from "./domains/documents/documents-router";
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
  openings: openingsRouter,
  tasks: tasksRouter,
  users: usersRouter,
  writing: writingRouter,
});

export type AppRouter = typeof appRouter;

export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
