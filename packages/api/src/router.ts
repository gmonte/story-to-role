import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createTRPCRouter } from "./tools/trpc";
import { careerRouter } from "./domains/career/career-router";
import { chatRouter } from "./domains/chat/chat-router";
import { interviewRouter } from "./domains/interview/interview-router";
import { openingsRouter } from "./domains/openings/openings-router";
import { tasksRouter } from "./domains/tasks/tasks-router";
import { usersRouter } from "./domains/users/users-router";

export const appRouter = createTRPCRouter({
  career: careerRouter,
  chat: chatRouter,
  interview: interviewRouter,
  openings: openingsRouter,
  tasks: tasksRouter,
  users: usersRouter,
});

export type AppRouter = typeof appRouter;

export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
