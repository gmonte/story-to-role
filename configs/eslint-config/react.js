import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config} */
export const reactLibraryConfig = [
  ...baseConfig,

  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
    },
  },
];
