import { auth } from "@clerk/nextjs/server";
import { initTRPC, TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import SuperJSON from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import { z, ZodError } from "zod";

import { logger } from "@repo/common/tools/logger";
import { getTranslation } from "@repo/intl/get-translation";
import { parseHeaderCookie } from "@repo/common/tools/cookies/common";

import { usersTable } from "../domains/users/db/users-tables";
import { db } from "./db";
import { getLocaleForContext } from "./intl/get-locale-for-context";
import {
  upstashRateLimiter,
  type RateLimiter,
  type RateLimitName,
} from "./rate-limit";

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

export const createTRPCContext = async (opts: {
  headers: Headers;
  signal?: AbortSignal;
}) => {
  const session = await auth();

  const cookies = parseHeaderCookie(opts.headers.get("Cookie"));
  const locale = getLocaleForContext({ cookies, headers: opts.headers });
  const t = await getTranslation(locale);

  return {
    session,
    t,
    ...opts,
  };
};

const t = initTRPC
  .meta<OpenApiMeta>()
  .context<typeof createTRPCContext>()
  .create({
    transformer: SuperJSON,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof ZodError
              ? z.treeifyError(error.cause)
              : null,
        },
      };
    },
  });

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

const loggingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;

  if (result.ok) {
    logger.debug(["tRPC"], `${path} ${duration}ms`);
  } else {
    logger.error(["tRPC"], `${path} ${duration}ms`, { error: result.error });
  }

  return result;
});

export const publicProcedure = t.procedure.use(loggingMiddleware);

export const protectedProcedure = t.procedure
  .use(loggingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.userId) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: ctx.t.formatMessage({
          defaultMessage: "Unauthorized",
        }),
      });
    }
    return next({
      ctx: {
        session: { ...ctx.session, userId: ctx.session.userId },
      },
    });
  });

/**
 * A signed-in user whose local record exists (the Clerk webhook creates it),
 * with our own `userId`: what every service acts for.
 */
export const userProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const user = await db.query.usersTable.findFirst({
    columns: { id: true },
    where: and(
      eq(usersTable.clerkUserId, ctx.session.userId),
      isNull(usersTable.deletedAt)
    ),
  });

  if (!user) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: ctx.t.formatMessage({ defaultMessage: "User not found" }),
    });
  }

  return next({ ctx: { userId: user.id } });
});

/**
 * Rejects the call with TOO_MANY_REQUESTS once the user exceeds `name`'s
 * limit. Use it on every procedure that starts a task.
 */
export function rateLimited(
  name: RateLimitName,
  limiter: RateLimiter = upstashRateLimiter
) {
  return t.middleware(async ({ ctx, next }) => {
    const userId = (ctx as { userId?: string }).userId;
    if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });

    if (!(await limiter.allow(name, userId))) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: ctx.t.formatMessage({
          defaultMessage: "Too many requests. Wait a moment and try again.",
        }),
      });
    }

    return next();
  });
}
