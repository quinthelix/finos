#!/bin/bash
# Simple migration runner for Postgres
# Runs all .sql files in db/migrations/ in sorted order, tracking applied ones

set -e

DB_CONTAINER="${DB_CONTAINER:-db}"
DB_USER="${DB_USER:-app}"
DB_NAME="${DB_NAME:-app}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MIGRATIONS_DIR="$SCRIPT_DIR/migrations"

# Create schema_migrations table if not exists
docker compose exec -T "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" <<EOF
CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
EOF

echo "Checking for pending migrations..."

# Get list of applied migrations
APPLIED=$(docker compose exec -T "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -A -c "SELECT version FROM schema_migrations ORDER BY version;")

# Run each migration file in sorted order
for migration_file in "$MIGRATIONS_DIR"/*.sql; do
  if [ ! -f "$migration_file" ]; then
    continue
  fi
  
  filename=$(basename "$migration_file")
  
  # Check if already applied
  if echo "$APPLIED" | grep -q "^${filename}$"; then
    echo "  [skip] $filename (already applied)"
    continue
  fi
  
  echo "  [run]  $filename"
  
  # Run the migration
  cat "$migration_file" | docker compose exec -T "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME"
  
  # Record it as applied
  docker compose exec -T "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -c \
    "INSERT INTO schema_migrations (version) VALUES ('$filename');"
  
  echo "         -> applied"
done

echo "Migrations complete."

