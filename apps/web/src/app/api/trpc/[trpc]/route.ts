/* eslint-disable no-console */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";

import { appRouter } from "@repo/api/router";
import { createTRPCContext } from "@repo/api/tools/trpc";
import { env } from "@repo/common/env/web.env";

const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
    signal: req.signal,
  });
};

export const dynamic = "force-dynamic";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `tRPC failed on ${path ?? "<no-path>"}: ${error.message}`
            );
          }
        : undefined,
  });

export { handler as GET, handler as POST };
