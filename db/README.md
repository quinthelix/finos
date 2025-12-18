# Database

## Migrations

Place SQL migrations in `db/migrations/` with numeric prefixes (e.g., `0001_init.sql`, `0002_add_feature.sql`). Apply in order:
- `0001_init.sql` (core schema)
- `0002_commodities_and_structured_erp.sql` (commodities + structured ERP POs)
- `0003_raw_unique_index.sql` (unique index on raw ERP POs)
- `0004_raw_erp_unique_column.sql` (generated erp_record_id + unique constraint)
- `0005_erp_inventory.sql` (inventory snapshots)
- `0005_status_defaults.sql` (status defaults)
- `0006_raw_erp_record_id_generated.sql` (generated raw erp id)
- `0007_commodity_ticker_provider.sql` (provider registry + ticker fields on commodities)

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

- `db/dev_seed.sql` adds a demo company/user plus sample market, exposure, trade, position rows, and the traded commodity set used across the demo (sugar, wheat, cocoa, butter, milk, soybean oil, oats, corn, coffee, cotton). It is idempotent for repeated runs.
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

## Schema map (mermaid)

```mermaid
erDiagram
  companies ||--o{ company_users : has
  users ||--o{ company_users : member
  price_providers ||--o{ commodities : offers
  commodities ||--o{ market_prices : prices
  companies ||--o{ raw_erp_data : ingests
  companies ||--o{ erp_purchase_orders : orders
  commodities ||--o{ erp_purchase_orders : ordered_as
  raw_erp_data ||--o| erp_purchase_orders : raw_ref
  companies ||--o{ erp_inventory_snapshots : inventories
  commodities ||--o{ erp_inventory_snapshots : tracked_as
  raw_erp_data ||--o| erp_inventory_snapshots : raw_ref
  companies ||--o{ exposures : risk
  commodities ||--o{ exposures : risk_on
  companies ||--o{ trades : trade
  commodities ||--o{ trades : trade_on
  companies ||--o{ positions : holds
  commodities ||--o{ positions : held_on

  companies {
    uuid id PK
    text name
  }
  users {
    uuid id PK
    text email UK
  }
  company_users {
    uuid company_id FK
    uuid user_id FK
    text role
  }
  price_providers {
    text id PK
    text base_url
  }
  commodities {
    text id PK
    text display_name
    text unit
    text ticker
    text provider FK price_providers.id
  }
  market_prices {
    bigserial id PK
    text commodity_id
    numeric price
    text currency
    timestamptz as_of
  }
  raw_erp_data {
    bigserial id PK
    uuid company_id FK companies.id
    text record_type
    text erp_record_id
  }
  erp_purchase_orders {
    uuid id PK
    uuid company_id FK companies.id
    text commodity_id FK commodities.id
    timestamptz created_at
    numeric price_per_unit
    bigint raw_erp_data_id FK raw_erp_data.id
  }
  erp_inventory_snapshots {
    uuid company_id FK companies.id
    text commodity_id FK commodities.id
    timestamptz as_of
    bigint raw_erp_data_id FK raw_erp_data.id
  }
  exposures {
    bigserial id PK
    uuid company_id FK companies.id
    text commodity_id
  }
  trades {
    bigserial id PK
    uuid company_id FK companies.id
    text commodity_id
  }
  positions {
    bigserial id PK
    uuid company_id FK companies.id
    text commodity_id
  }
```
