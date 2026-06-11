import { auth } from "@clerk/nextjs/server";
import { initTRPC, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import type { OpenApiMeta } from "trpc-to-openapi";
import { z, ZodError } from "zod";

import { logger } from "@repo/common/tools/logger";
import { getTranslation } from "@repo/intl/get-translation";
import { parseHeaderCookie } from "@repo/common/tools/cookies/common";

import { getLocaleForContext } from "./intl/get-locale-for-context";

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
          error.cause instanceof ZodError ? z.treeifyError(error.cause) : null,
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
