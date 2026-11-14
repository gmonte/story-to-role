# Nx Cloud remote cache, only in CI quality jobs

Quality (typecheck, lint, tests) runs on every pull request and before every staging and production deploy, so task results should survive between pipelines. We use Nx remote caching through Nx Cloud (free Hobby plan, in a "story-to-role" organization of its own), with the workspace id committed as `nxCloudId` in `nx.json` and a read-write `NX_CLOUD_ACCESS_TOKEN` stored only as a GitHub Actions secret and passed only to the quality step. The pull request quality job always runs the full check: the cache skips what did not change, and file-based filters were wrong (a `.sql`-only change skipped quality entirely). We followed the adc-monorepo setup (its ADR 0003) and did not grant Nx Cloud write access to the GitHub repository, since caching needs none.

## Consequences

- **Builds and `predeploy` never use the cache.** `predeploy` has side effects (`db:migrate`, `trigger:deploy`) that a cache hit would silently skip, and Next.js builds bake `NEXT_PUBLIC_*` values that Nx does not hash, so a cached build could cross environments. Because the workspace id is committed, deploy jobs set `NX_NO_CLOUD=true`, and the Vercel project must set `NX_NO_CLOUD=true` in every environment; the token is never given to Vercel.
- A read-write token on pull requests is safe only while every contributor is trusted (solo today). With outside contributors, pull requests should switch to a read-only token.
- When the monthly credits run out, runs fall back to uncached: slower, still correct.
