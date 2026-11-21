import type { NextConfig } from "next";

import { env } from "@repo/common/env/web.env";

const nextConfig: NextConfig = {
  ...(env.ALLOWED_DEV_ORIGIN && {
    allowedDevOrigins: [env.ALLOWED_DEV_ORIGIN],
  }),
  experimental: {
    authInterrupts: true,
    viewTransition: true,
  },
  reactCompiler: true,
  // Native: the source preview renders PDF pages with it on the server.
  serverExternalPackages: ["@napi-rs/canvas"],
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
