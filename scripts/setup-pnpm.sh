#!/usr/bin/env bash

# setup-pnpm.sh — Point PNPM_HOME at the active nvm node bin ($NVM_BIN) so pnpm's
# global bin dir and store follow whatever node version nvm has activated.
#
# Why not `pnpm setup`? In a corepack + nvm setup the pnpm binary lives inside
# $NVM_BIN, so `pnpm setup` freezes PNPM_HOME to the *current* node version's path
# and warns (ERR_PNPM_BAD_SHELL_SECTION) on every re-run. This script instead
# writes the literal string "$NVM_BIN", which the shell resolves at startup — so
# the block is node-version-agnostic and never needs regenerating.
#
# Two ways to run:
#   scripts/setup-pnpm.sh          -> edits the rc; takes effect in NEW shells
#   source scripts/setup-pnpm.sh   -> edits the rc AND applies to the CURRENT shell
#
# Idempotent: re-running rewrites the single managed "# pnpm ... # pnpm end" block.
# Supports bash, zsh and fish on macOS and Linux (and WSL / Git Bash on Windows).
# Native Windows (PowerShell/cmd) is out of scope for this POSIX script.
#
# If a different "# pnpm" block already exists, it warns and refuses to overwrite
# it (like `pnpm setup`); pass --force (-f) to replace it.
#
# Usage: source scripts/setup-pnpm.sh [bash|zsh|fish] [--force]
#        (shell defaults to your $SHELL)

# NB: no `set -e`/`exit` at top level — this file may be sourced into an
# interactive shell, where those would change its options or close it.
_setup_pnpm_usage() {
  cat <<'EOF'
setup-pnpm.sh — point PNPM_HOME at the active nvm node bin ($NVM_BIN)

Usage:
  scripts/setup-pnpm.sh [shell] [--force]          edit the rc file
  source scripts/setup-pnpm.sh [shell] [--force]   edit the rc AND apply to the current shell

Arguments:
  shell           bash | zsh | fish   (defaults to your $SHELL)

Options:
  -f, --force     replace an existing, different "# pnpm" block instead of warning
  -h, --help      show this help and exit

Behavior:
  * No "# pnpm" block        -> writes one.
  * Matching block           -> leaves the file untouched.
  * Different block          -> warns and refuses, unless --force is given.

The block stores the literal "$NVM_BIN", so it follows whatever node version nvm
activates and never needs regenerating after `nvm install`.
EOF
}

_setup_pnpm() {
  local start="# pnpm" end="# pnpm end"
  local shell_name="" rc block force=0 arg

  # Parse args: --force/-f to overwrite a conflicting block, --help/-h for usage;
  # otherwise the optional positional arg selects the shell (defaults to $SHELL).
  for arg in "$@"; do
    case "$arg" in
      --force | -f) force=1 ;;
      --help | -h)
        _setup_pnpm_usage
        return 0
        ;;
      -*)
        echo "setup-pnpm.sh: unknown option '$arg' (try --help)" >&2
        return 2
        ;;
      *) shell_name="$arg" ;;
    esac
  done
  shell_name="${shell_name:-$(basename "${SHELL:-bash}")}"

  case "$shell_name" in
    fish)
      rc="${XDG_CONFIG_HOME:-$HOME/.config}/fish/config.fish"
      read -r -d '' block <<'EOF'
# pnpm
if set -q NVM_BIN
    set -gx PNPM_HOME "$NVM_BIN"
    if not contains "$PNPM_HOME" $PATH
        set -gx PATH "$PNPM_HOME" $PATH
    end
end
# pnpm end
EOF
      ;;
    zsh)
      rc="$HOME/.zshrc"
      read -r -d '' block <<'EOF'
# pnpm
if [ -n "$NVM_BIN" ]; then
  export PNPM_HOME="$NVM_BIN"
  case ":$PATH:" in
    *":$PNPM_HOME:"*) ;;
    *) export PATH="$PNPM_HOME:$PATH" ;;
  esac
fi
# pnpm end
EOF
      ;;
    bash | *)
      rc="$HOME/.bashrc"
      read -r -d '' block <<'EOF'
# pnpm
if [ -n "$NVM_BIN" ]; then
  export PNPM_HOME="$NVM_BIN"
  case ":$PATH:" in
    *":$PNPM_HOME:"*) ;;
    *) export PATH="$PNPM_HOME:$PATH" ;;
  esac
fi
# pnpm end
EOF
      ;;
  esac

  mkdir -p "$(dirname "$rc")" || return 1
  touch "$rc" || return 1

  # If a managed block already matches what we'd write, leave the file untouched.
  local current
  current="$(awk -v s="$start" -v e="$end" \
    '$0 == s { c = 1 } c { print } $0 == e && c { exit }' "$rc")"

  if [ "$current" = "$block" ]; then
    echo "✓ pnpm already configured for $shell_name in $rc (no change)"
  elif [ -n "$current" ] && [ "$force" -ne 1 ]; then
    # A different managed block already exists — warn and refuse to clobber it,
    # mirroring `pnpm setup`'s ERR_PNPM_BAD_SHELL_SECTION. Use --force to replace.
    echo "⚠ $rc already contains a different '# pnpm' section." >&2
    echo "  Leaving it as-is. Re-run with --force to replace it:" >&2
    echo "    ${BASH_SOURCE[0]:-$0} ${shell_name} --force" >&2
    return 0
  else
    # No managed block (or --force): drop any existing one and rewrite cleanly.
    if grep -qxF "$start" "$rc"; then
      awk -v s="$start" -v e="$end" '
        $0 == s { skip = 1 }
        skip && $0 == e { skip = 0; next }
        !skip { print }
      ' "$rc" >"$rc.tmp" && mv "$rc.tmp" "$rc"
    fi

    # Trim trailing blank lines so repeated runs don't accumulate them.
    awk 'NF { last = NR } { line[NR] = $0 } END { for (i = 1; i <= last; i++) print line[i] }' \
      "$rc" >"$rc.tmp" && mv "$rc.tmp" "$rc"

    # Append the fresh block, separated by a blank line if the file is non-empty.
    [ -s "$rc" ] && printf '\n' >>"$rc"
    printf '%s\n' "$block" >>"$rc"

    echo "✓ pnpm configured for $shell_name in $rc"
  fi

  # If this file was sourced, also apply to the current shell right now so no
  # restart is needed. (When executed, these exports just vanish with the child.)
  if [ -n "${NVM_BIN:-}" ]; then
    export PNPM_HOME="$NVM_BIN"
    case ":$PATH:" in
      *":$PNPM_HOME:"*) ;;
      *) export PATH="$PNPM_HOME:$PATH" ;;
    esac
    echo "  PNPM_HOME=$PNPM_HOME"
  else
    echo "  (run 'nvm use' first so \$NVM_BIN is set, then re-source)"
  fi
}

_setup_pnpm "$@"
_setup_pnpm_status=$?
unset -f _setup_pnpm _setup_pnpm_usage 2>/dev/null || true

# Propagate the status — `return` when sourced (so it can't close the shell),
# `exit` when executed.
if (return 0 2>/dev/null); then
  return "$_setup_pnpm_status"
else
  exit "$_setup_pnpm_status"
fi
