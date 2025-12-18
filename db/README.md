# Database (`db/`)

The platform uses a single shared **Postgres** database for local development and (later) Supabase Postgres in remote environments.

### Goals

- **Multi-tenant by design**: company-scoped tables include `company_id`.
- **Shared schema**: one DB, one set of migrations, no per-service databases.
- **Idempotent ingest**: raw ERP payloads are deduped using a computed `erp_record_id`.

### Quick start (local)

Reset everything (drop DB, apply all migrations, seed demo data):

```bash
docker compose up -d db
./db/re-init.sh
```

### What `re-init.sh` does

`db/re-init.sh`:

- Drops & recreates the `app` database.
- Runs every `.sql` file in `db/migrations/` in **lexicographic order** (numeric prefix).
- Applies `db/dev_seed.sql`.

### Migrations

Migrations live in `db/migrations/` and must use unique numeric prefixes:

- `0001_init.sql`: core schema (tenancy + market + trades + raw ERP)
- `0002_commodities_and_structured_erp.sql`: `commodities` + `erp_purchase_orders`
- `0003_raw_unique_index.sql`: extra raw ERP uniqueness/indexing
- `0004_raw_erp_unique_column.sql`: ensures raw ERP unique key support
- `0005_erp_inventory.sql`: `erp_inventory_snapshots`
- `0006_status_defaults.sql`: status normalization/defaults for POs
- `0007_raw_erp_record_id_generated.sql`: idempotently enforces `erp_record_id` as GENERATED
- `0008_commodity_ticker_provider.sql`: `price_providers` + ticker/provider metadata on `commodities`

Run a single migration manually:

```bash
cat db/migrations/0001_init.sql | docker compose exec -T db psql -U app -d app
```

### Seed data (local dev)

`db/dev_seed.sql` seeds:

- **Demo tenant**:
  - Company: `Ugibisco Cookies (Dallas, TX)` (`00000000-0000-0000-0000-000000000001`)
  - User: `bert.broder@ugibisco.com` with password `ugibisco-demo` (bcrypt via `pgcrypto`)
  - Membership in `company_users`
- **Reference data**:
  - `price_providers`: currently `yahoo`
  - `commodities`: demo commodity universe (used across GUI + services)
- **Market data**:
  - Inserts a deterministic **seed** price curve: 1 year of daily points per commodity into `market_prices` with `source='seed'`
  - This ensures the GUI always has a visible price series even if external scraping is unavailable.
- **Inventory visibility**:
  - Inserts a current-week `erp_inventory_snapshots` row per commodity for the demo company.
- **Demo platform rows**:
  - Minimal examples in `exposures`, `trades`, and `positions`.

### Expected DB state after `./db/re-init.sh`

After a reset, you should see:

- A demo company + user + company membership.
- `commodities` populated with ticker/provider metadata (via migration `0008_...` + seed).
- `market_prices` populated with **seed** points for each commodity:
  - uniqueness guaranteed by `(commodity_id, as_of, source)` (see `uq_market_prices_unique`)
- `erp_inventory_snapshots` populated for the current week boundary.

### Table overview (ownership + purpose)

- **`companies` / `users` / `company_users`**: tenant/user scaffolding (Phase 0 demo auth).
- **`commodities`**: canonical commodity registry (id, display name, unit, ticker, provider).
- **`price_providers`**: provider registry (base URL, optional api key env name).
- **`market_prices`**: global time-series market data.
  - Written by `commodity-scraper`
  - Read by `api-gateway` for GUI
- **`raw_erp_data`**: append-only raw ingestion store per company.
  - `erp_record_id` is **GENERATED** from `payload->>'id'` for idempotent ingest
  - Written by `erp-extractor`
- **`erp_purchase_orders`**: structured, queryable purchase orders derived from raw ERP.
  - Written by `erp-extractor`
  - Read by `api-gateway` for GUI
- **`erp_inventory_snapshots`**: structured inventory readouts (weekly snapshots).
  - Written by `erp-extractor`
  - Read by `api-gateway` for GUI
- **`exposures`**: risk results (owned by `risk-engine`, stubbed in seed for now).
- **`trades` / `positions`**: trading history + current position state (owned by `trade-gateway`, stubbed in seed).

### Schema map (Mermaid ERD)

```mermaid
erDiagram
  companies ||--o{ company_users : has
  users ||--o{ company_users : member

  price_providers ||--o{ commodities : offers
  commodities ||--o{ market_prices : prices

  companies ||--o{ raw_erp_data : ingests
  raw_erp_data ||--o| erp_purchase_orders : raw_ref
  raw_erp_data ||--o| erp_inventory_snapshots : raw_ref

  companies ||--o{ erp_purchase_orders : orders
  commodities ||--o{ erp_purchase_orders : ordered_as

  companies ||--o{ erp_inventory_snapshots : inventories
  commodities ||--o{ erp_inventory_snapshots : tracked_as

  companies ||--o{ exposures : risk
  companies ||--o{ trades : trade
  companies ||--o{ positions : holds

  companies {
    uuid id PK
    text name
  }

  users {
    uuid id PK
    text email UK
    text password_hash
  }

  company_users {
    uuid company_id FK
    uuid user_id FK
    text role
  }

  price_providers {
    text id PK
    text display_name
    text base_url
    text api_key_env
  }

  commodities {
    text id PK
    text name
    text display_name
    text unit
    text ticker
    text provider FK
  }

  market_prices {
    bigserial id PK
    text commodity_id
    numeric price
    text currency
    text unit
    text source
    timestamptz as_of
    %% unique: (commodity_id, as_of, source)
  }

  raw_erp_data {
    bigserial id PK
    uuid company_id FK
    text record_type
    jsonb payload
    text erp_record_id "GENERATED from payload->>'id'"
    timestamptz recorded_at
  }

  erp_purchase_orders {
    uuid id PK
    uuid company_id FK
    text commodity_id FK
    numeric quantity
    text unit
    numeric price_per_unit
    text currency
    timestamptz created_at
    timestamptz delivery_date
    text status
    bigint raw_erp_data_id FK
  }

  erp_inventory_snapshots {
    uuid company_id FK
    text commodity_id FK
    numeric on_hand
    text unit
    timestamptz as_of
    bigint raw_erp_data_id FK
    %% PK: (company_id, commodity_id, as_of)
  }

  exposures {
    bigserial id PK
    uuid company_id FK
    text commodity_id
    numeric exposure_amount
    text currency
    timestamptz as_of
  }

  trades {
    bigserial id PK
    uuid company_id FK
    text commodity_id
    text side
    numeric quantity
    numeric price
    text currency
    text status
    text provider
    text external_ref
    timestamptz placed_at
  }

  positions {
    bigserial id PK
    uuid company_id FK
    text commodity_id
    numeric quantity
    numeric avg_price
    text currency
    %% unique: (company_id, commodity_id)
  }
```

### Utilities

- `db/re-init.sh`: the standard local reset path.
- `db/reset.sql`: drops and recreates the `public` schema (useful in some debugging flows, but `re-init.sh` is preferred).
