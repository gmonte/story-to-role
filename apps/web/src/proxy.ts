import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { intlMiddleware } from "./tools/intl/middleware/intl-middleware";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  if (!request.nextUrl.pathname.startsWith("/api")) {
    return intlMiddleware(request);
  }
});

export const config = {
  matcher: ["/((?!_next|_vercel|.*\\..*).*)", "/api(.*)"],
};
