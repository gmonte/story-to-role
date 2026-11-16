import "@repo/common/env/web.env";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
