# Database

## Migrations

Place SQL migrations in `db/migrations/` with numeric prefixes (e.g., `0001_init.sql`, `0002_add_feature.sql`). Apply in order:
- `0001_init.sql` (core schema)
- `0002_commodities_and_structured_erp.sql` (commodities + structured ERP POs)
- `0003_raw_unique_index.sql` (unique index on raw ERP POs)
- `0004_raw_erp_unique_column.sql` (generated erp_record_id + unique constraint)

### Running Migrations Automatically

Use the migration runner script to apply all pending migrations:

```bash
docker compose up -d db
./db/migrate.sh
```

The script:
- Creates a `schema_migrations` table to track applied migrations
- Runs each `.sql` file in sorted order
- Skips already-applied migrations
- Records each successful migration

### Running a Single Migration Manually

```bash
cat db/migrations/0001_init.sql | docker compose exec -T db psql -U app -d app
```

## Seeding for local dev

- `db/dev_seed.sql` adds a demo company/user plus sample market, exposure, trade, position rows, and the 12 cookie-related commodities. It is idempotent for repeated runs.
- Default demo identity: company "Ugibisco Cookies (Dallas, TX)", user "Bert Broder" (`bert.broder@ugibisco.com`), password `ugibisco-demo` (stored as `crypt`/bcrypt hash via `pgcrypto`).
- Apply after migrations: `cat db/dev_seed.sql | docker compose exec -T db psql -U app -d app`

## Resetting local DB quickly

Drop and recreate the public schema, then rerun migrations and seeds:

```bash
docker compose exec -T db psql -U app -d app -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
./db/migrate.sh
cat db/dev_seed.sql | docker compose exec -T db psql -U app -d app
```

## GUI access to Postgres (local)

- `docker compose up -d pgadmin` (db service starts automatically)
- Open http://localhost:5050 and log in with `admin@example.com` / `admin`.
- Add a new server in pgAdmin pointing to host `db`, port `5432`, user `app`, password `app`.

## Notes

- Keep schema multi-tenant: include `company_id` where relevant.
- Market data is global; other tables are company-scoped.
