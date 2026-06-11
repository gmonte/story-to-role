import { NextResponse, type NextRequest } from "next/server";

import { getLocaleFromHeaders } from "@repo/api/tools/intl/get-locale-from-headers";
import { getCookieConfig } from "@repo/common/tools/cookies/common";
import { logger } from "@repo/common/tools/logger";

export function intlMiddleware(request: NextRequest) {
  const response = NextResponse.rewrite(
    new URL(request.nextUrl.pathname + request.nextUrl.search, request.url),
    { request }
  );

  const intlLocaleCookieConfig = getCookieConfig("intl-locale");

  if (!request.cookies.has(intlLocaleCookieConfig.name)) {
    const locale = getLocaleFromHeaders(request.headers);
    logger.info(["intl", "middleware"], "Setting locale cookie", { locale });

    response.cookies.set(intlLocaleCookieConfig.name, locale, {
      ...intlLocaleCookieConfig.options,
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
    });
  }

  return response;
}
