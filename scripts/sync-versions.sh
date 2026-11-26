#!/bin/bash

# sync-versions.sh — run every version-sync script, propagating the single sources of
# truth to the files that hard-code them:
#   - Node:   package.json "engines.node"      -> .nvmrc, .github/workflows (NODE_VERSION)
#   - vercel: pnpm-workspace.yaml root catalog -> .github/workflows (VERCEL_CLI_VERSION)
#
# Idempotent and dependency-free (sed only). Run manually with `bash scripts/sync-versions.sh`,
# or automatically from the husky pre-commit hook when a source file is staged.

SELF="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SELF")" && pwd)"

bash "$SCRIPT_DIR/sync-node-version.sh"
bash "$SCRIPT_DIR/sync-vercel-version.sh"
