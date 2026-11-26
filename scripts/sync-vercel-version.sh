#!/bin/bash

# sync-vercel-version.sh — propagate the vercel CLI version from the pnpm-workspace.yaml
# `root` catalog (the single source of truth, also used as `catalog:root` by the root
# package.json devDependency) to the GitHub workflows' VERCEL_CLI_VERSION, so CI installs
# the same version developers use locally.
#
# Idempotent: the file is rewritten only when the version actually differs, so it's safe
# to run repeatedly (e.g. from the husky pre-commit hook). Uses sed (no node/jq) so it
# also works before Node is installed.

SELF="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SELF")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Read the `vercel: <version>` entry from pnpm-workspace.yaml. The pattern matches a
# catalog key line (leading whitespace + `vercel:`), so it ignores the `- vercel`
# minimumReleaseAgeExclude entry and the scoped `@vercel/*` packages.
vercel_version="$(sed -n -E 's/^[[:space:]]*vercel:[[:space:]]*"?([^"[:space:]#]+)"?.*/\1/p' "$ROOT_DIR/pnpm-workspace.yaml" | head -1)"
if [ -z "$vercel_version" ]; then
  echo "sync-vercel-version: could not read vercel version from pnpm-workspace.yaml — nothing changed" >&2
  exit 0
fi

# GitHub workflows — `VERCEL_CLI_VERSION: "<version>"` in each workflow's env.
# Replace only the version, keeping the quotes. Rewrite via a temp file + `cat >`
# so the original file's permissions are kept (portable; avoids GNU/BSD `sed -i`
# differences).
for workflow in "$ROOT_DIR"/.github/workflows/*.yml; do
  [ -f "$workflow" ] || continue
  current_ci="$(sed -n -E 's/^[[:space:]]*VERCEL_CLI_VERSION:[[:space:]]*"([^"]+)".*/\1/p' "$workflow" | head -1)"
  if [ -n "$current_ci" ] && [ "$current_ci" != "$vercel_version" ]; then
    tmp="$(mktemp)"
    sed -E "s|^([[:space:]]*VERCEL_CLI_VERSION:[[:space:]]*\")[^\"]+(\")|\1${vercel_version}\2|" "$workflow" >"$tmp"
    cat "$tmp" >"$workflow"
    rm -f "$tmp"
    echo "sync-vercel-version: updated $(basename "$workflow") VERCEL_CLI_VERSION to $vercel_version"
  fi
done
