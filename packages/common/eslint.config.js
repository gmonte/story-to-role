import { baseConfig } from "@repo/eslint-config/base";
import { createRestrictedImportsConfig } from "@repo/eslint-config/utils/create-restricted-import-config";

export const restrictedImports = [];

/** @type {import("eslint").Linter.Config} */
export default [...baseConfig, createRestrictedImportsConfig(restrictedImports)];
