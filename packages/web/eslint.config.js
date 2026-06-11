import { reactLibraryConfig } from "@repo/eslint-config/react";
import { createRestrictedImportsConfig } from "@repo/eslint-config/utils/create-restricted-import-config";

export const restrictedImports = [];

/** @type {import("eslint").Linter.Config} */
export default [
  ...reactLibraryConfig,
  createRestrictedImportsConfig(restrictedImports),
];
