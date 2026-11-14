# StoryToRole

Turn your career story into tailored resumes and cover letters.

| Environment | URL |
| --- | --- |
| Production | https://storytorole.vercel.app |
| Staging | https://stg-storytorole.vercel.app |
| Pull requests | `https://pr-<number>-storytorole.vercel.app` |

Before changing anything, read `CLAUDE.md`, `docs/plan.md`, `docs/specs/`, `GLOSSARY.md` and `docs/adr/`.

Stack:

- pnpm + lerna + nx
- Next.js (App Router) + React 19
- tRPC + TanStack Query
- Drizzle ORM + Postgres
- Clerk auth
- Tailwind CSS 4
- react-intl (`@repo/intl`)
- Shared ESLint / Prettier / TypeScript configs

## Development

```bash
# setup
$ nvm use
$ corepack enable
$ pnpm install

# env
$ cp .env.example .env.local

# dev
$ pnpm dev:web

# qol
$ pnpm lint
$ pnpm typecheck
$ pnpm test
```

## Database

Run package scripts from the root through lerna, which loads `.env.local`:

```bash
$ pnpm exec lerna run db:generate --scope=@repo/api -- --name <migration-name>
$ pnpm exec lerna run db:migrate --scope=@repo/api
$ pnpm exec lerna run db:studio --scope=@repo/api
```
