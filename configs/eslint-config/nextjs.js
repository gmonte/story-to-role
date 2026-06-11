import pluginNext from "@next/eslint-plugin-next";
import pluginQuery from "@tanstack/eslint-plugin-query";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import { baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config} */
export const nextjsConfig = [
  ...baseConfig,

  {
    ...pluginReact.configs.flat.recommended,

    languageOptions: {
      ...pluginReact.configs.flat.recommended.languageOptions,
      globals: {
        ...globals.serviceworker,
      },
    },
  },

  {
    plugins: {
      "@next/next": pluginNext,
    },
    rules: {
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,
    },
  },

  {
    files: ["!tests/**"],
    plugins: {
      "react-hooks": pluginReactHooks,
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,

      // React scope no longer necessary with new JSX transform.
      "react/react-in-jsx-scope": "off",
    },
  },

  ...pluginQuery.configs["flat/recommended"],

  {
    ignores: ["**/.next/**", "**/next-env.d.ts"],
  },
];
