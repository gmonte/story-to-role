import clerkNext from "@clerk/eslint-plugin/next";

import { restrictedImports as commonLibraryRestrictedImports } from "@repo/common/eslint.config";
import { nextjsConfig } from "@repo/eslint-config/nextjs";
import { createRestrictedImportsConfig } from "@repo/eslint-config/utils/create-restricted-import-config";
import { restrictedImports as webLibraryRestrictedImports } from "@repo/web/eslint.config";

const restrictedImports = [
  ...webLibraryRestrictedImports,
  ...commonLibraryRestrictedImports,
  {
    wrongImports: ["radix-ui"],
    correctImports: ["@repo/web/components/ui"],
    importNames: ["*"],
  },
];

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextjsConfig,
  createRestrictedImportsConfig(restrictedImports),
  // Every page, route and Server Function checks the session itself; the
  // proxy doesn't gate anything. Public: the landing, signing in or up,
  // webhooks (they check their signatures), the tRPC and REST handlers
  // (their procedures check the session) and the locale and currency
  // cookies.
  {
    plugins: { "@clerk/next": clerkNext },
    rules: {
      "@clerk/next/require-auth-protection": [
        "error",
        {
          protected: ["**"],
          public: [
            // The folder only: the landing and the root layout.
            "src/app",
            "src/app/sign-in/**",
            "src/app/sign-up/**",
            "src/app/api/webhooks/**",
            "src/app/api/trpc/**",
            "src/app/api/rest/**",
            // Cookie setters the landing's switchers call, signed out too.
            "src/tools/intl/actions",
            "src/domains/billing/actions",
          ],
        },
      ],
    },
  },
];
