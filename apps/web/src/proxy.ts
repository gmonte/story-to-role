import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { intlMiddleware } from "./tools/intl/middleware/intl-middleware";

// No auth gate here: every page, route handler and procedure checks the
// session itself (Clerk deprecated path-based checks, which can drift from
// how Next routes a request). Clerk still needs its middleware to run.
export default clerkMiddleware((_auth, request) => {
  // The workspace opens on the start screen, which sends anyone who has
  // started on to My career. An HTTP redirect, unlike redirect() in
  // a page, is also followed by the client-side navigation after sign-in.
  if (request.nextUrl.pathname === "/app") {
    return NextResponse.redirect(new URL("/app/start", request.url));
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
