#!/bin/bash

usage() {
  cat <<'EOF'
clean-install.sh — wipe build/dependency artifacts and reinstall from scratch.

Usage:
  scripts/clean-install.sh [--force] [--help]

Options:
  -f, --force   forward --force to setup-pnpm.sh so it replaces an existing,
                conflicting "# pnpm" block in your shell rc (otherwise it just
                warns and leaves the block as-is).
  -h, --help    show this help and exit.

Steps: clean artifacts -> nvm install -> corepack pnpm -> configure PNPM_HOME -> pnpm install -> link skills
EOF
}

# Resolve our own directory even when this script is *sourced* (wtp's post_create
# hook runs `source ./scripts/clean-install.sh`, where $0 is the caller, not us).
# ${BASH_SOURCE[0]} is the script file under bash; fall back to $0 for zsh-source.
SELF="${BASH_SOURCE[0]:-$0}"
SCRIPT_DIR="$(cd "$(dirname "$SELF")" && pwd)"
force=0

for arg in "$@"; do
  case "$arg" in
    -f | --force) force=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "clean-install.sh: unknown option '$arg' (try --help)" >&2
      exit 2
      ;;
  esac
done

# Every step below resolves against the current directory — `nvm install` reads
# .nvmrc, corepack and pnpm read package.json, and the rm/ln paths are relative.
# Anchor to the repo root so the script behaves the same from any cwd, and
# restore the caller's directory at the end, since wtp *sources* this file.
ORIGINAL_PWD="$PWD"
cd "$SCRIPT_DIR/.." || exit 1

# clean up
rm -rf .husky/_/*
rm -rf .nx
rm -rf apps/*/.next
rm -rf apps/*/dist
rm -rf apps/*/node_modules
rm -rf configs/*/node_modules
rm -rf packages/*/node_modules
rm -rf node_modules

# install nvm/node
. "$SCRIPT_DIR/setup-nvm.sh"

# Forget cached executable paths after nvm changed PATH.
hash -r

# install pnpm — no version argument, so corepack reads it from the
# "packageManager" field in package.json (single source of truth).
corepack prepare --activate
corepack enable

# configure PNPM_HOME to follow the active nvm node ($NVM_BIN) — replaces
# `pnpm setup`, which freezes the node version and warns on re-runs.
if [ "$force" -eq 1 ]; then
  bash "$SCRIPT_DIR/setup-pnpm.sh" --force
else
  bash "$SCRIPT_DIR/setup-pnpm.sh"
fi

# install dependencies
pnpm install

# link the committed skills into .claude/skills. The skills themselves live in
# .agents/skills/, which every agent but Claude Code reads directly; Claude Code
# looks in .claude/skills/, which has to be rebuilt here. Skipped while the repo
# commits no skills, so the glob never links a literal "*".
if [ -d .agents/skills ]; then
  mkdir -p .claude/skills
  find .claude/skills -maxdepth 1 -type l ! -exec test -e {} \; -delete
  for skill in .agents/skills/*/; do
    [ -d "$skill" ] || continue
    name="$(basename "$skill")"
    ln -sfn "../../.agents/skills/$name" ".claude/skills/$name"
  done
fi

cd "$ORIGINAL_PWD" || exit 1
