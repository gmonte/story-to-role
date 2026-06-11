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
];
