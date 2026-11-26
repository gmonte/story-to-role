#!/bin/bash

main() (
  set -e

  usage() {
    cat <<'EOF'
restore-database.sh — restore a SQL backup into a database (the local one by default).

Usage:
  source ./scripts/restore-database.sh <name> [options]

Arguments:
  name           Name of the SQL backup to restore (backup-<name>.sql).
                 Well-known names: local, staging, or production; or any custom
                 name produced by `backup-database.sh` (e.g. pr-123).

Options:
  --target-database-url <url>   Restore into this database instead of the local
                                one. Everything in it is replaced, so the script
                                asks for confirmation first (skip it with --yes).
  -y, --yes                     Don't ask for confirmation before replacing a
                                target that isn't on this machine.
  -d, --delete                  Delete the SQL backup after a successful restore.
  -h, --help                    Show this help and exit.

Input:
  .database/backup-<name>.sql

Target database:
  --target-database-url, or DATABASE_URL from .env.local by default

Environment variables:
  PG_CONTAINER   Name of a running Postgres Docker container. When set, the
                 createdb/psql commands run inside it via `docker exec` (for
                 machines that only have Postgres in Docker). When unset, host
                 tools are used (e.g. Postgres.app).

Examples:
  # Host psql (e.g. Postgres.app)
  source ./scripts/restore-database.sh staging
  source ./scripts/restore-database.sh staging --delete

  # Restore a custom-named backup (backup-pr-123.sql)
  source ./scripts/restore-database.sh pr-123

  # Replace staging's database with a backup of the local one
  source ./scripts/backup-database.sh local
  source ./scripts/restore-database.sh local --target-database-url "postgres://..."

  # Postgres only in Docker — restore into the running container
  PG_CONTAINER=story-to-role-postgres source ./scripts/restore-database.sh staging

Steps:
  -> resolve target database   (--target-database-url, or .env.local)
  -> confirm                   (only for a target that isn't on this machine)
  -> create it if missing      (only for a target on this machine)
  -> drop its public and drizzle schemas
  -> restore SQL backup
  -> optionally delete backup
EOF
  }

  NAME=""
  TARGET_DATABASE_URL=""
  ASSUME_YES=0
  DELETE_BACKUP=0

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --target-database-url)
        if [ -z "$2" ]; then
          echo "restore-database.sh: --target-database-url requires a value (try --help)" >&2
          return 2
        fi

        TARGET_DATABASE_URL="$2"
        shift
        ;;
      --target-database-url=*)
        TARGET_DATABASE_URL="${1#*=}"
        ;;
      -y|--yes)
        ASSUME_YES=1
        ;;
      -d|--delete)
        DELETE_BACKUP=1
        ;;
      -h|--help)
        usage
        return 0
        ;;
      -*)
        echo "restore-database.sh: unknown option '$1' (try --help)" >&2
        return 2
        ;;
      *)
        if [ -n "$NAME" ]; then
          echo "restore-database.sh: too many names provided (try --help)" >&2
          return 2
        fi

        NAME="$1"
        ;;
    esac
    shift
  done

  if [ -z "$NAME" ]; then
    echo "restore-database.sh: name is required (try --help)" >&2
    return 2
  fi

  ROOT_DIR="$(pwd)"
  DATABASE_DIR=".database"
  BACKUP_FILE="$ROOT_DIR/$DATABASE_DIR/backup-$NAME.sql"

  if [ ! -f "$BACKUP_FILE" ]; then
    echo "restore-database.sh: backup not found: $BACKUP_FILE" >&2
    return 1
  fi

  if [ -z "$TARGET_DATABASE_URL" ]; then
    ENV_FILE="$ROOT_DIR/.env.local"

    if [ ! -f "$ENV_FILE" ]; then
      echo "restore-database.sh: .env.local not found" >&2
      return 1
    fi

    TARGET_DATABASE_URL="$(set -a && . "$ENV_FILE" && printf '%s' "$DATABASE_URL")"

    if [ -z "$TARGET_DATABASE_URL" ]; then
      echo "restore-database.sh: DATABASE_URL is not defined in .env.local" >&2
      return 1
    fi
  fi

  # Neon's pooled host goes through PgBouncer, which a restore shouldn't use;
  # the same host without -pooler is the direct one.
  TARGET_DATABASE_URL="${TARGET_DATABASE_URL/-pooler./.}"

  # Split the URL into its parts: scheme://[user[:password]@]host[:port]/database[?params]
  TARGET_AUTHORITY="${TARGET_DATABASE_URL#*://}"
  TARGET_AUTHORITY="${TARGET_AUTHORITY%%/*}"
  TARGET_HOST="${TARGET_AUTHORITY##*@}"
  TARGET_HOST="${TARGET_HOST%%:*}"
  TARGET_DATABASE="${TARGET_DATABASE_URL#*://*/}"
  TARGET_DATABASE="${TARGET_DATABASE%%\?*}"

  case "$TARGET_HOST" in
    localhost|127.0.0.1|::1|"") TARGET_IS_LOCAL=1 ;;
    *) TARGET_IS_LOCAL=0 ;;
  esac

  echo "Source backup: $BACKUP_FILE"
  echo "Target database: $TARGET_DATABASE on ${TARGET_HOST:-localhost}"

  if [ "$TARGET_IS_LOCAL" -eq 0 ] && [ "$ASSUME_YES" -eq 0 ]; then
    printf 'This replaces everything in %s on %s.\nType “%s” to continue: ' \
      "$TARGET_DATABASE" "$TARGET_HOST" "$TARGET_DATABASE"
    read -r CONFIRMATION

    if [ "$CONFIRMATION" != "$TARGET_DATABASE" ]; then
      echo "restore-database.sh: aborted" >&2
      return 1
    fi
  fi

  if [ -n "$PG_CONTAINER" ]; then
    # Run the client tools inside the Postgres Docker container. Only psql
    # reading the backup needs -i (it reads it from stdin).
    if ! command -v docker >/dev/null 2>&1; then
      echo "restore-database.sh: PG_CONTAINER is set but docker is not installed" >&2
      return 1
    fi

    # Docker installed as root (user not in the docker group) can't reach the
    # daemon socket, so fall back to sudo. `sudo docker info` also primes the
    # sudo credentials so psql reading the backup from stdin isn't interrupted.
    DOCKER=(docker)
    if ! docker info >/dev/null 2>&1; then
      echo "docker needs elevated permissions; using sudo docker" >&2
      if ! sudo docker info >/dev/null 2>&1; then
        echo "restore-database.sh: cannot reach the Docker daemon (is it running?)" >&2
        return 1
      fi
      DOCKER=(sudo docker)
    fi

    PG=("${DOCKER[@]}" exec -i "$PG_CONTAINER")
  elif command -v psql >/dev/null 2>&1; then
    # Host tools (e.g. Postgres.app).
    PG=()
  else
    echo "restore-database.sh: need psql on host, or set PG_CONTAINER to your Postgres Docker container" >&2
    return 1
  fi

  # A fresh machine may not have the local database yet; createdb connects to the
  # server's maintenance database, so point it at the same server.
  if [ "$TARGET_IS_LOCAL" -eq 1 ]; then
    MAINTENANCE_URL="${TARGET_DATABASE_URL%%/"$TARGET_DATABASE"*}/postgres"

    if ! "${PG[@]}" psql "$TARGET_DATABASE_URL" -c 'SELECT 1' >/dev/null 2>&1; then
      echo "Creating database: $TARGET_DATABASE"
      "${PG[@]}" createdb --maintenance-db="$MAINTENANCE_URL" "$TARGET_DATABASE"
    fi
  fi

  # Drop what the backup recreates rather than the whole database: a hosted
  # database (Neon) can't be dropped and recreated through its own connection.
  # The extensions in public (pgvector) go with it; the backup recreates them.
  echo "Clearing $TARGET_DATABASE"

  "${PG[@]}" psql --set ON_ERROR_STOP=on --quiet "$TARGET_DATABASE_URL" <<'SQL'
SET client_min_messages = warning;
DROP SCHEMA IF EXISTS drizzle CASCADE;
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
SQL

  echo "Restoring $NAME backup → $TARGET_DATABASE"

  "${PG[@]}" psql \
    --set ON_ERROR_STOP=on \
    --quiet \
    "$TARGET_DATABASE_URL" \
    < "$BACKUP_FILE" \
    > /dev/null

  if [ "$DELETE_BACKUP" -eq 1 ]; then
    rm "$BACKUP_FILE"
    echo "Backup deleted: $BACKUP_FILE"
  fi

  echo "Database restored successfully."
)

main "$@"
STATUS=$?

unset -f main

if [ "${BASH_SOURCE[0]}" != "$0" ]; then
  return "$STATUS"
else
  exit "$STATUS"
fi
