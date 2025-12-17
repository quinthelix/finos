# Database

## Migrations

Place SQL migrations in `db/migrations/` with numeric prefixes (e.g., `0001_init.sql`, `0002_add_feature.sql`). Apply in order:
- `0001_init.sql` (core schema)
- `0002_commodities_and_structured_erp.sql` (commodities + structured ERP POs)
- `0003_raw_unique_index.sql` (unique index on raw ERP POs)
- `0004_raw_erp_unique_column.sql` (generated erp_record_id + unique constraint)

### Running Migrations Automatically

Use the re-init script to fully reset the local DB, run all migrations, and seed demo data:

```bash
docker compose up -d db
./db/re-init.sh
```

The script:
- Drops & recreates the `app` database
- Runs every `.sql` file in `db/migrations/` (sorted)
- Runs `db/dev_seed.sql`

### Running a Single Migration Manually

```bash
cat db/migrations/0001_init.sql | docker compose exec -T db psql -U app -d app
```

## Seeding for local dev

- `db/dev_seed.sql` adds a demo company/user plus sample market, exposure, trade, position rows, and the 12 cookie-related commodities. It is idempotent for repeated runs.
- Default demo identity: company "Ugibisco Cookies (Dallas, TX)", user "Bert Broder" (`bert.broder@ugibisco.com`), password `ugibisco-demo` (stored as `crypt`/bcrypt hash via `pgcrypto`).
- Apply after migrations: `cat db/dev_seed.sql | docker compose exec -T db psql -U app -d app`

## Resetting local DB quickly

Reset everything (drop DB, rerun migrations, reseed):

```bash
./db/re-init.sh
```

## GUI access to Postgres (local)

- `docker compose up -d pgadmin` (db service starts automatically)
- Open http://localhost:5050 and log in with `admin@example.com` / `admin`.
- Add a new server in pgAdmin pointing to host `db`, port `5432`, user `app`, password `app`.

## Notes

- Keep schema multi-tenant: include `company_id` where relevant.
- Market data is global; other tables are company-scoped.
