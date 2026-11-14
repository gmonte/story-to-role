This is a pnpm workspace monorepo (lerna + nx).

**Important**: Always run `nvm use` before every command. Each Bash tool call starts a fresh shell, so PATH changes from the previous command don't persist. Run `nvm use && <your-command>` in a single command to chain them.

**Important**: This monorepo uses pnpm named catalogs for dependency management. When installing a new dependency:
1. Get the latest version: `pnpm view <package-name> version`
2. Add the version to the chosen named catalog in `pnpm-workspace.yaml` and reference it as `"catalog:<name>"` in the target package's `package.json`
3. Run `pnpm install` from the workspace root to update the lockfile

**Important**: This repo uses husky git hooks that run on commit. Commits must follow Conventional Commits format (enforced by commitlint via `.commitlintrc.json` and commitizen via `.czrc`).

**Important**: For UI formatting and i18n, get `t` from `@repo/intl`: use `useTranslation` in client components and `getTranslation` in server components.

**Important**: Never hand-write database migrations. Edit the drizzle schema (`packages/api/src/domains/*/db/*-tables.ts`), then run `pnpm --filter @repo/api db:generate --name <migration-name>` to generate the SQL. Create a unique migration name each time you generate a migration that reflects the changes made to the schema (e.g., `add_column_name`). If a migration with the same name already exists, it will be overwritten, so be careful! After it's created, edit the generated `.sql` file to add `IF NOT EXISTS` (or `IF EXISTS` for drops) to every statement so the migration can be re-run without errors.

Commands:

```sh
pnpm dev:web      # next dev
pnpm lint         # eslint + prettier (runs typecheck first per package)
pnpm lint:fix     # eslint + prettier fixing
pnpm typecheck    # tsc across packages
pnpm test         # vitest across packages
```

## Product docs

Read before implementing: `docs/plan.md` (slice order and acceptance criteria), `docs/specs/*.md` (source of truth), `GLOSSARY.md` (use its terms in code and UI) and `docs/adr/` (decisions not to undo).

## Local development

Secrets live in `.env.local` (git-ignored); `.env.example` lists every variable.

- **Postgres:** Postgres.app (PostgreSQL 18 with pgvector available), database `story_to_role`. drizzle-kit does not read `.env.local` on its own: `nvm use && set -a && . ./.env.local && set +a && pnpm --filter @repo/api db:migrate`.
- **Redis / rate limiting:** Homebrew Redis on the host plus serverless-redis-http in Docker (OrbStack): `docker compose up -d`. The app talks to it as Upstash at `http://localhost:8079`.
- **Trigger.dev:** org "Story To Role", project "Story To Role Preview" (`TRIGGER_PROJECT_REF`), CLI profile `storytorole`. Run tasks locally with `npx trigger.dev@4.7.3 dev --profile storytorole` (inside `packages/api` once `trigger.config.ts` exists).
- **Clerk webhooks:** `ngrok http --url=greatly-central-ladybird.ngrok-free.app 3000`; the dev endpoint is `https://greatly-central-ladybird.ngrok-free.app/api/clerk/webhooks` (`user.created`, `user.updated`, `user.deleted`).
- **Stripe (sandbox):** `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints the local `STRIPE_WEBHOOK_SECRET`.
- **Storage:** `STORAGE_DRIVER=local` writes to `.storage/`.
- **AI:** `ANTHROPIC_API_KEY` is StoryToRole's own key (the default provider package, and the topic gate for credit-funded users). Tests must mock providers, Stripe and Trigger.dev.
