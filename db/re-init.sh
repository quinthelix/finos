#!/bin/bash
# Re-initialize local Postgres DB for the finos monorepo:
# - drops & recreates the DB
# - runs all migrations in db/migrations/ (sorted)
# - runs db/dev_seed.sql
#
# Usage:
#   docker compose up -d db
#   ./db/re-init.sh
#
# Env overrides:
#   DB_SERVICE=db DB_USER=app DB_NAME=app ./db/re-init.sh

set -euo pipefail

DB_SERVICE="${DB_SERVICE:-db}"
DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-app}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"
SEED_FILE="$SCRIPT_DIR/dev_seed.sql"

echo "Ensuring Postgres service is running..."
docker compose up -d "$DB_SERVICE" >/dev/null

echo "Waiting for Postgres to accept connections..."
for i in {1..60}; do
  if docker compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker compose exec -T "$DB_SERVICE" pg_isready -U "$DB_USER" -d postgres >/dev/null 2>&1; then
  echo "Postgres did not become ready in time."
  exit 1
fi

echo "Dropping and recreating database '$DB_NAME'..."
docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
-- Terminate connections so DROP DATABASE works reliably
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${DB_NAME}'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS "${DB_NAME}";
CREATE DATABASE "${DB_NAME}";
SQL

echo "Running migrations from $MIGRATIONS_DIR ..."
for migration_file in "$MIGRATIONS_DIR"/*.sql; do
  if [ ! -f "$migration_file" ]; then
    continue
  fi
  filename="$(basename "$migration_file")"
  echo "  [run] $filename"
  cat "$migration_file" | docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1
done

if [ -f "$SEED_FILE" ]; then
  echo "Seeding from $(basename "$SEED_FILE") ..."
  cat "$SEED_FILE" | docker compose exec -T "$DB_SERVICE" psql -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 >/dev/null
  echo "Seed applied."
else
  echo "Seed file not found: $SEED_FILE (skipping)"
fi

echo "Re-init complete."


