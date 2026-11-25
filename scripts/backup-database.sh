#!/bin/bash

main() (
  set -e

  usage() {
    cat <<'EOF'
backup-database.sh — create a local SQL backup of a database.

Usage:
  source ./scripts/backup-database.sh <name>
  source ./scripts/backup-database.sh <name> --database-url <url>

Arguments:
  name           Name of the backup (backup-<name>.sql). Required. Well-known
                 names — local, staging, production — resolve their DATABASE_URL
                 on their own: local reads .env.local, staging and production pull
                 it from Vercel (staging is the always-on preview deployment, so it
                 pulls Vercel's preview environment). Any other name requires
                 --database-url.

Options:
  --database-url <url>   Back up this database URL directly, skipping the
                         DATABASE_URL resolution. Required when <name> is not a
                         well-known environment.
  -h, --help             Show this help and exit.

Output:
  .database/backup-<name>.sql

Environment variables:
  PG_CONTAINER   Name of a running Postgres Docker container. When set, pg_dump
                 runs inside it via `docker exec` (for machines that only have
                 Postgres in Docker). The container just supplies the pg_dump
                 binary; it still dumps the database from DATABASE_URL.
                 When unset, host tools are used (e.g. Postgres.app).

Examples:
  # Host pg_dump (e.g. Postgres.app)
  source ./scripts/backup-database.sh staging
  source ./scripts/backup-database.sh local

  # Postgres only in Docker — dump via the running container
  PG_CONTAINER=story-to-role-postgres source ./scripts/backup-database.sh staging

  # Back up an arbitrary database URL, named backup-pr-123.sql
  source ./scripts/backup-database.sh pr-123 --database-url "postgres://..."

Steps:
  -> resolve DATABASE_URL    (skipped with --database-url)
       local:               read from .env.local
       staging/production:  pulled from Vercel with `pnpm exec vercel env pull`
  -> dump database           (Neon's pooled host is swapped for the direct one)
  -> drop Neon-only column options
  -> save SQL backup
EOF
  }

  NAME=""
  CUSTOM_DATABASE_URL=""
  VERCEL_ENV=""

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --database-url)
        if [ -z "$2" ]; then
          echo "backup-database.sh: --database-url requires a value (try --help)" >&2
          return 2
        fi

        CUSTOM_DATABASE_URL="$2"
        shift
        ;;
      --database-url=*)
        CUSTOM_DATABASE_URL="${1#*=}"
        ;;
      -h|--help)
        usage
        return 0
        ;;
      -*)
        echo "backup-database.sh: unknown option '$1' (try --help)" >&2
        return 2
        ;;
      *)
        if [ -n "$NAME" ]; then
          echo "backup-database.sh: too many names provided (try --help)" >&2
          return 2
        fi

        NAME="$1"
        ;;
    esac
    shift
  done

  if [ -z "$NAME" ]; then
    echo "backup-database.sh: name is required (try --help)" >&2
    return 2
  fi

  # Without a custom URL, the name must be a well-known environment whose
  # DATABASE_URL we can resolve; anything else needs an explicit --database-url.
  # staging is the always-on preview deployment, so it maps to Vercel's preview
  # environment.
  if [ -z "$CUSTOM_DATABASE_URL" ]; then
    case "$NAME" in
      local) ;;
      production) VERCEL_ENV="production" ;;
      staging) VERCEL_ENV="preview" ;;
      *)
        echo "backup-database.sh: '$NAME' is not a well-known environment; pass --database-url to back up a custom database (try --help)" >&2
        return 2
        ;;
    esac
  fi

  ROOT_DIR="$(pwd)"
  DATABASE_DIR=".database"

  BACKUP_DIR="$ROOT_DIR/$DATABASE_DIR"
  BACKUP_FILE="$BACKUP_DIR/backup-${NAME}.sql"

  mkdir -p "$BACKUP_DIR"

  if [ -n "$CUSTOM_DATABASE_URL" ]; then
    # Use the provided URL directly — no resolution needed.
    DATABASE_URL="$CUSTOM_DATABASE_URL"
  elif [ -z "$VERCEL_ENV" ]; then
    ENV_FILE="$ROOT_DIR/.env.local"

    if [ ! -f "$ENV_FILE" ]; then
      echo "backup-database.sh: .env.local not found" >&2
      return 1
    fi

    DATABASE_URL="$(set -a && . "$ENV_FILE" && printf '%s' "$DATABASE_URL")"
  else
    # Pull the environment into a temporary file, read DATABASE_URL from it and
    # delete it right away, so the environment's secrets never stay on disk.
    ENV_FILE="$(mktemp)"
    trap 'rm -f "$ENV_FILE"' EXIT

    . "./scripts/setup-nvm.sh" >&2

    pnpm exec vercel env pull "$ENV_FILE" --environment "$VERCEL_ENV" --yes >&2

    DATABASE_URL="$(set -a && . "$ENV_FILE" && printf '%s' "$DATABASE_URL")"
    rm -f "$ENV_FILE"
  fi

  if [ -z "$DATABASE_URL" ]; then
    echo "backup-database.sh: could not resolve DATABASE_URL for '$NAME'" >&2
    return 1
  fi

  # Neon's pooled host (<endpoint>-pooler.<region>...) goes through PgBouncer,
  # which pg_dump shouldn't use; the same host without -pooler is the direct one.
  DATABASE_URL="${DATABASE_URL/-pooler./.}"

  echo "Backing up $NAME database..."

  # The container/host only supplies the pg_dump binary, which must be >= the
  # server major version.
  if [ -n "$PG_CONTAINER" ]; then
    # Run pg_dump inside the Postgres Docker container (host has no client tools).
    if ! command -v docker >/dev/null 2>&1; then
      echo "backup-database.sh: PG_CONTAINER is set but docker is not installed" >&2
      return 1
    fi

    # Docker installed as root (user not in the docker group) can't reach the
    # daemon socket, so fall back to sudo. `sudo docker info` also primes the
    # sudo credentials so the dump itself doesn't stop at a password prompt.
    DOCKER=(docker)
    if ! docker info >/dev/null 2>&1; then
      echo "docker needs elevated permissions; using sudo docker" >&2
      if ! sudo docker info >/dev/null 2>&1; then
        echo "backup-database.sh: cannot reach the Docker daemon (is it running?)" >&2
        return 1
      fi
      DOCKER=(sudo docker)
    fi

    "${DOCKER[@]}" exec "$PG_CONTAINER" \
      pg_dump --no-owner --no-privileges "$DATABASE_URL" \
      > "$BACKUP_FILE"
  elif command -v pg_dump >/dev/null 2>&1; then
    # Host tools (e.g. Postgres.app).
    pg_dump \
      --no-owner \
      --no-privileges \
      "$DATABASE_URL" \
      > "$BACKUP_FILE"
  else
    echo "backup-database.sh: need pg_dump on host, or set PG_CONTAINER to your Postgres Docker container" >&2
    return 1
  fi

  # Neon tags every column with an internal option (ALTER COLUMN ... SET
  # (pg_attver=...)) that any other Postgres rejects, so drop those lines to keep
  # the backup restorable anywhere. A temp file + `cat >` avoids GNU/BSD `sed -i`.
  FILTERED_FILE="$(mktemp)"
  sed -E '/^ALTER TABLE ONLY .* ALTER COLUMN .* SET \(pg_attver=[0-9]+\);$/d' \
    "$BACKUP_FILE" > "$FILTERED_FILE"
  cat "$FILTERED_FILE" > "$BACKUP_FILE"
  rm -f "$FILTERED_FILE"

  echo "Backup created: $BACKUP_FILE"
)

main "$@"
STATUS=$?

unset -f main

if [ "${BASH_SOURCE[0]}" != "$0" ]; then
  return "$STATUS"
else
  exit "$STATUS"
fi
