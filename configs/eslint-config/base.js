import js from "@eslint/js";
import formatjsPlugin from "eslint-plugin-formatjs";
import pluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import checkFile from "eslint-plugin-check-file";

/** @type {import("eslint").Linter.Config} */
export const baseConfig = [
  js.configs.recommended,

  ...tseslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  pluginPrettierRecommended,

  {
    plugins: {
      formatjs: formatjsPlugin,
    },
    rules: {
      ...formatjsPlugin.configs.recommended.rules,
      "formatjs/enforce-description": "off",
      "formatjs/no-id": "error",
      "formatjs/no-literal-string-in-jsx": "warn",
      "formatjs/no-literal-string-in-object": [
        "warn",
        { include: ["{label,placeholder,title}"] },
      ],
    },
  },

  {
    plugins: {
      import: importPlugin,
    },
    rules: {
      "@typescript-eslint/no-import-type-side-effects": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "import/newline-after-import": ["warn", { count: 1 }],
      "import/no-duplicates": ["warn", { "prefer-inline": true }],
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling"],
            "index",
          ],
          "newlines-between": "always",
          alphabetize: {
            order: "ignore",
            orderImportKind: "asc",
            caseInsensitive: true,
          },
          pathGroups: [
            {
              pattern: "react",
              group: "external",
              position: "before",
            },
            {
              pattern: "@repo/**",
              group: "internal",
              position: "before",
            },
            {
              pattern: "~/**",
              group: "internal",
              position: "after",
            },
          ],
          pathGroupsExcludedImportTypes: ["builtin"],
        },
      ],
    },
  },

  {
    plugins: {
      "check-file": checkFile,
    },
    rules: {
      "check-file/no-index": "error",
      "check-file/filename-naming-convention": [
        "error",
        { "**/*.{ts,tsx}": "?([+_])+([a-z0-9])*(-+([a-z0-9]))" },
        { ignoreMiddleExtensions: true },
      ],
      "check-file/folder-naming-convention": [
        "error",
        { "**/*": "NEXT_JS_APP_ROUTER_CASE" },
      ],
    },
  },

  {
    rules: {
      "@typescript-eslint/array-type": [
        "warn",
        {
          default: "array-simple",
        },
      ],
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          ignoreVoid: true,
          ignoreIIFE: true,
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "no-console": "error",
    },
  },

  {
    ignores: ["dist", "**/*.{cjs,js,mjs}"],
  },

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js"],
        },
      },
    },
  },
];
