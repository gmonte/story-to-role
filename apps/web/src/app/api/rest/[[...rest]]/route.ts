import type { NextRequest } from "next/server";
import { createOpenApiFetchHandler } from "trpc-to-openapi";

import { appRouter } from "@repo/api/router";
import { createTRPCContext } from "@repo/api/tools/trpc";
import { logger } from "@repo/common/tools/logger";

const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
    signal: req.signal,
  });
};

export const dynamic = "force-dynamic";

const handler = (req: NextRequest) => {
  return createOpenApiFetchHandler({
    endpoint: "/api/rest",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError: ({ path, error }) => {
      logger.error(
        ["tRPC"],
        `tRPC failed on ${path ?? "<no-path>"}: ${error.message}`
      );
    },
  });
};

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
  handler as OPTIONS,
  handler as HEAD,
};
