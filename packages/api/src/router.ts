import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import { createTRPCRouter } from "./tools/trpc";
import { usersRouter } from "./domains/users/users-router";

export const appRouter = createTRPCRouter({
  users: usersRouter,
});

export type AppRouter = typeof appRouter;

export type AppRouterInputs = inferRouterInputs<AppRouter>;
export type AppRouterOutputs = inferRouterOutputs<AppRouter>;
