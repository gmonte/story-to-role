import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

import { intlMiddleware } from "./tools/intl/middleware/intl-middleware";

const isPublicRoute = createRouteMatcher([
  "/",
  "/api/clerk/webhooks(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }

  if (!request.nextUrl.pathname.startsWith("/api")) {
    return intlMiddleware(request);
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|_vercel|.*\\..*).*)",
    // Always run for API routes
    "/api(.*)",
    // Clerk's auto-proxy for production *.vercel.app hosts
    "/__clerk/:path*",
  ],
};
