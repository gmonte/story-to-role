#!/bin/bash

# sync-node-version.sh — propagate the Node version from package.json "engines.node"
# (the single source of truth) to the files that hard-code it: .nvmrc and the GitHub workflows' NODE_VERSION.
#
# Idempotent: each file is rewritten only when its version actually differs, so it's
# safe to run repeatedly (e.g. from the husky pre-commit hook). Uses sed (no node/jq)
# so it also works before Node is installed.

SELF="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SELF")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

node_version="$(sed -n -E 's/^[[:space:]]*"node"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$ROOT_DIR/package.json" | head -1)"
if [ -z "$node_version" ]; then
  echo "sync-node-version: could not read engines.node from package.json — nothing changed" >&2
  exit 0
fi

# .nvmrc — a header comment plus the version on its own line. Read the current
# version from the first non-comment, non-blank line (matching how nvm parses it).
nvmrc="$ROOT_DIR/.nvmrc"
current_nvmrc="$(sed -n -E '/^[[:space:]]*#/d; /^[[:space:]]*$/d; s/^[[:space:]]*([^[:space:]]+).*/\1/p' "$nvmrc" 2>/dev/null | head -1)"
if [ "$node_version" != "$current_nvmrc" ]; then
  {
    printf '# Auto-updated from package.json "engines.node" by scripts/sync-node-version.sh (git pre-commit) — do not edit by hand.\n'
    printf '%s\n' "$node_version"
  } >"$nvmrc"
  echo "sync-node-version: updated .nvmrc to $node_version"
fi

# GitHub workflows — `NODE_VERSION: <version>` in each workflow's env. Rewrite via
# a temp file + `cat >` so the original file's permissions are kept (portable;
# avoids GNU/BSD `sed -i` differences).
for workflow in "$ROOT_DIR"/.github/workflows/*.yml; do
  [ -f "$workflow" ] || continue
  current_ci="$(sed -n -E 's/^[[:space:]]*NODE_VERSION:[[:space:]]*"?([0-9][0-9.]+)"?.*/\1/p' "$workflow" | head -1)"
  if [ -n "$current_ci" ] && [ "$current_ci" != "$node_version" ]; then
    tmp="$(mktemp)"
    sed -E "s|^([[:space:]]*NODE_VERSION:[[:space:]]*\"?)[0-9][0-9.]+|\1${node_version}|" "$workflow" >"$tmp"
    cat "$tmp" >"$workflow"
    rm -f "$tmp"
    echo "sync-node-version: updated $(basename "$workflow") NODE_VERSION to $node_version"
  fi
done
