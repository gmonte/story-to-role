This is a pnpm workspace monorepo (lerna + nx).

**Important**: Always run `nvm use` before every command. Each Bash tool call starts a fresh shell, so PATH changes from the previous command don't persist. Run `nvm use && <your-command>` in a single command to chain them.

**Important**: This monorepo uses pnpm named catalogs for dependency management. When installing a new dependency:
1. Get the latest version: `pnpm view <package-name> version`
2. Add the version to the chosen named catalog in `pnpm-workspace.yaml` and reference it as `"catalog:<name>"` in the target package's `package.json`
3. Run `pnpm install` from the workspace root to update the lockfile

**Important**: This repo uses husky git hooks that run on commit. Commits must follow Conventional Commits format (enforced by commitlint via `.commitlintrc.json` and commitizen via `.czrc`).

**Important**: For UI formatting and i18n, get `t` from `@repo/intl`: use `useTranslation` in client components and `getTranslation` in server components.

**Important**: Never hand-write database migrations. Edit the drizzle schema (`packages/api/src/domains/*/db/*-tables.ts`), then run `pnpm --filter @repo/api db:generate` to generate the SQL. After it's created, edit the generated `.sql` file to add `IF NOT EXISTS` (or `IF EXISTS` for drops) to every statement so the migration can be re-run without errors.

Commands:

```sh
pnpm dev:web      # next dev
pnpm lint         # eslint + prettier (runs typecheck first per package)
pnpm lint:fix     # eslint + prettier fixing
pnpm typecheck    # tsc across packages
pnpm test         # vitest across packages
```
