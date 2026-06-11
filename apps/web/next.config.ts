import "@repo/common/env/web.env";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
