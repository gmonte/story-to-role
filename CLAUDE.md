This is a pnpm workspace monorepo (lerna + nx).

**Important**: Always run `nvm use` before every command. Each Bash tool call starts a fresh shell, so PATH changes from the previous command don't persist. Run `nvm use && <your-command>` in a single command to chain them.

**Important**: This monorepo uses pnpm named catalogs for dependency management. When installing a new dependency:
1. Get the latest version: `pnpm view <package-name> version`
2. Ask the user which named catalog it should be added to (check `pnpm-workspace.yaml` for existing catalogs)
3. Add the version to the chosen named catalog in `pnpm-workspace.yaml` and reference it as `"catalog:<name>"` in the target package's `package.json`
4. Run `pnpm install` from the workspace root to update the lockfile

**Important**: Never commit or push directly to `main`, and never to `staging` except documentation-only changes (Markdown docs such as `docs/`, `GLOSSARY.md`, `CLAUDE.md`, `readme.md`). Every other change goes on its own branch (from `origin/staging`) and reaches `staging` through a pull request, where the quality gate runs; releases are pull requests from `staging` into `main`. Pushes to `staging` and `main` only deploy (staging and production), so a direct code commit would skip quality.

**Important**: Never merge a pull request (nor enable auto-merge on it) before every check on it has finished and passed: confirm with `gh pr checks <number>`, and if any check is pending or failing, wait or fix it. GitHub can't enforce this on this private free-plan repository, so the merge button stays enabled while checks run; this rule is the only guard. Within that rule, agents may merge pull requests (feature PRs into `staging` and release PRs into `main`) whenever they judge it timely, without waiting to be asked; a pull request that depends on another is opened only after the first one is merged.

**Important**: After each completed stage (a slice of `docs/plan.md` with its acceptance criteria passing, or another milestone the user names), create an annotated checkpoint tag `checkpoint/<NN>-<name>` (next number after the latest `checkpoint/*` tag) on the `staging` commit that completes it, with a one-line summary as the message, and push it: `git tag -a checkpoint/02-foundation <sha> -m "..." && git push origin checkpoint/02-foundation`.

**Important**: This repo uses husky git hooks that run on commit. Commits must follow Conventional Commits format (enforced by commitlint via `.commitlintrc.json` and commitizen via `.czrc`). Wait for hooks to finish before proceeding.

**Important**: Commit message body lines must be ≤ 100 characters (commitlint `body-max-line-length`), so wrap long paragraphs. The pre-commit hook runs `eslint --max-warnings=0` on staged files, so warnings block commits.

**Important**: Run package scripts from the monorepo root through lerna, scoped to the package, because nx loads the root `.env.local` for every task: `pnpm exec lerna run <script> --scope=<package>` (for example `pnpm exec lerna run db:migrate --scope=@repo/api`). Running them with `pnpm --filter` or inside the package does **not** load `.env.local`.

**Important**: Never hand-write database migrations. Edit the drizzle schema (`packages/api/src/domains/*/db/*-tables.ts`), then run `pnpm exec lerna run db:generate --scope=@repo/api -- --name <migration-name>` to generate the SQL. Create a unique migration name each time you generate a migration that reflects the changes made to the schema (e.g., `add_column_name`). If a migration with the same name already exists, it will be overwritten, so be careful! After it's created, edit the generated `.sql` file to add `IF NOT EXISTS` (or `IF EXISTS` for drops) to every statement so the migration can be re-run without errors. Apply it with `pnpm exec lerna run db:migrate --scope=@repo/api`.

**Important**: The PR preview deploy (the `preview` job in `.github/workflows/pr.yml`) is **temporarily disabled** with `if: false`; pull requests only run `quality`, whose `packages/api/src/db.test.ts` runs every migration. To turn it back on, delete that `if` and, once Trigger.dev deploys work, restore the `predeploy` below in the same PR. The rest of this paragraph describes the preview as it works when enabled. A pull request that adds a migration (`packages/api/drizzle/*.sql`) deploys its preview against its own Neon branch, `preview/pr-<number>`, cloned from `main` of the `story-to-role-db-preview` project (staging's database), because the Vercel build runs `db:migrate`; the branch is reused by later pushes and deleted when the PR closes. Trigger.dev task deploys are **temporarily disabled**: Trigger.dev refuses every deploy for the organization ("Deployments are not available for this organization."), so `predeploy` only runs `db:migrate` and tasks are tested locally with `trigger:dev`. Once deploys work, restore `packages/api` `predeploy` to `pnpm db:migrate && if [ -z "$DATABASE_BRANCH" ]; then pnpm trigger:deploy; else echo 'DATABASE_BRANCH is set (branched preview) — skipping trigger:deploy'; fi`: every other preview, staging and production then deploy their tasks (as adc-monorepo does), and a preview on its own branch skips it, because the shared Trigger.dev worker reads staging's database.

**Important**: API domains follow router → service → repository → schemas/db under `packages/api/src/domains/<domain>/`. Routers validate I/O with Zod and delegate; services enforce permissions and open transactions; repositories build the queries. The frontend mirrors this under `apps/web/src/domains/<domain>/{components,hooks,utils}`.

**Important**: Never name a parameter just `id`. Every input that identifies a resource is `<domain>Id` (`positionId`, `openingId`, `applicationId`) — in the tRPC input schema, in the service and repository signatures, and in the REST path, which addresses a specific resource as `/<domain>/by-id/{<domain>Id}`. This applies to parameters, not to an entity's own `id` field inside a payload or output schema, and not to a database column.

**Important**: Never import `radix-ui` directly in `apps/`. Radix primitives must only be used inside `packages/web/`, which wraps them as components. Apps should import these wrappers from `@repo/web/components/ui`. To add a shadcn component, run from the workspace root: `nvm use && cd apps/web && pnpm dlx shadcn@canary add [COMPONENT]`.

**Important**: For UI formatting and i18n, get `t` from `@repo/intl`: use `useTranslation` in client components and `getTranslation` in server components. Use `t.formatMessage` for strings, `t.formatNumber` for numbers and percentages, and `t.formatDate` for dates.

**Important**: Every interface message ships in English and Brazilian Portuguese. The catalogs under `packages/intl/extracted` and `compiled` are generated and git-ignored; the Portuguese text lives in `packages/intl/translations/pt-BR.json` (message id → translation), which extraction applies. After adding or changing a message, run `pnpm exec lerna run intl:extract --scope=@repo/intl`, add the new ids from `packages/intl/extracted/en-US.json` to `translations/pt-BR.json`, and keep their placeholders; `@repo/intl`'s test fails on any message left untranslated.

**Important**: In any translated string (`defaultMessage` / i18n message), never use straight double quotes (`"`) to quote text *inside* the message — use typographic quotes `“` (U+201C) and `”` (U+201D) instead. The generator emits every message as a double-quoted TypeScript string literal in `packages/intl/intl-message-types.ts`, so a straight `"` inside a message closes that literal and breaks type generation. Straight single quotes/apostrophes (`'`) are fine.

**Important**: A procedure with `openapi` meta is rendered into an OpenAPI document by `trpc-to-openapi`, which accepts far less than Zod does. It only runs when someone opens `/api/docs`, so a schema it rejects throws in the browser at request time rather than failing the build. The rules:

- **The root of `.input()` must be a `ZodObject`.** Never a `z.union` or `z.discriminatedUnion`. A path parameter is resolved against the root object's *keys*, so `{positionId}` in the path needs `positionId` at the top level, non-optional. To branch on a discriminant, keep the identifiers at the root and nest the union under one key.
- **Every root key of a GET/DELETE input must be a primitive** (string, number, boolean, bigint, date), or an array or enum of one — they become query parameters.
- **`z.void()` has no OpenAPI representation** for outputs of mutations; return an object instead.

**Important**: API integration tests run against real Postgres via PGlite (`packages/api/src/test/pglite.ts`). Tests never call real AI providers, Stripe or Trigger.dev: mock them at the adapter boundary.

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

Secrets live in `.env.local` (git-ignored); `.env.example` lists every variable. `vercel env pull` restores `.env.local` from Vercel's Development environment, which holds the local values.

- **Postgres:** Postgres.app (PostgreSQL 18 with pgvector available), database `story_to_role`. Migrate with `nvm use && pnpm exec lerna run db:migrate --scope=@repo/api`.
- **Redis / rate limiting:** Homebrew Redis on the host plus serverless-redis-http in Docker (OrbStack): `docker compose up -d`. The app talks to it as Upstash at `http://localhost:8079` (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).
- **Trigger.dev:** org "Story To Role", project "Story To Role Preview" (`TRIGGER_PROJECT_REF`). `trigger:dev` uses the active Trigger.dev CLI profile, so make sure it is logged in to an account of that org (`npx trigger whoami`; pick another profile with `npx trigger switch <profile>`). Run tasks locally with `nvm use && pnpm exec lerna run trigger:dev --scope=@repo/api`.
- **Clerk webhooks:** `ngrok http --url=greatly-central-ladybird.ngrok-free.app 3000`; the dev endpoint is `https://greatly-central-ladybird.ngrok-free.app/api/webhooks/clerk` (`user.created`, `user.updated`, `user.deleted`).
- **Stripe (sandbox):** `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints the local `STRIPE_WEBHOOK_SECRET`.
- **Storage:** `STORAGE_DRIVER=local` writes to `.storage/`.
- **Encryption:** the local `ENCRYPTION_MASTER_KEY` lives in Vercel's Development environment, so `vercel env pull` keeps it. Never change it by hand: every data key in the local database is wrapped by it, and a different value makes all local career content unreadable (to rotate, move the old value to `ENCRYPTION_PREVIOUS_MASTER_KEYS`).
- **AI:** `ANTHROPIC_API_KEY` is StoryToRole's own key (the default provider package, and the topic gate for credit-funded users).
