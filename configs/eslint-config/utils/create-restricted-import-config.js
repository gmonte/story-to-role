import { z } from "zod";

const restrictedImportsSchema = z.array(
  z.object({
    wrongImports: z.array(z.string()),
    correctImports: z.array(z.string()),
    importNames: z.array(z.string()),
  })
);

/** @type {(_restrictedImports: z.infer<typeof restrictedImportsSchema>, files?: string[]) => import("eslint").Linter.Config[0]} */
export const createRestrictedImportsConfig = (
  _restrictedImports,
  files = ["**/*.{ts,tsx,js,jsx}"]
) => {
  const restrictedImports = restrictedImportsSchema.parse(_restrictedImports);
  return {
    files,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictedImports.reduce(
            (acc, restricted) => [
              ...acc,
              ...restricted.wrongImports.map((wrongImport) => ({
                name: wrongImport,
                importNames: restricted.importNames,
                message: `Use "${restricted.correctImports.join('" or "')}" instead.`,
              })),
            ],
            []
          ),
        },
      ],
    },
  };
};
