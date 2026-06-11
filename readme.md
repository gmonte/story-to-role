# company-balance

Hello-world monorepo built with the same architecture as the production repo it was copied from.

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

```bash
$ pnpm --filter @repo/api db:generate
$ pnpm --filter @repo/api db:migrate
$ pnpm --filter @repo/api db:studio
```
