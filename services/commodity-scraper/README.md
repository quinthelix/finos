# Commodity Scraper (`services/commodity-scraper/`)

The commodity-scraper ingests market price time-series into Postgres and exposes the data internally over **gRPC**.

### Responsibilities

- Load the commodity universe from the shared `commodities` table (ticker + provider).
- Fetch historical prices from the configured provider (currently Yahoo Finance).
- Upsert into `market_prices` with uniqueness `(commodity_id, as_of, source)`.
- Serve prices to other services via gRPC:
  - `ListPrices`
  - `GetLatestPrice`

### What this service is (and isn’t)

- **Internal-only gRPC** (no public REST).
- **DB-backed**: Postgres is the source of truth for stored prices.
- **Provider-pluggable by design**, but currently implemented inline in `src/index.ts`.

### Code structure

The current implementation is intentionally simple and lives mostly in one file:

- `src/index.ts`
  - **DB access**: `pg.Pool`, queries to `commodities` and `market_prices`
  - **Provider fetch**: `fetchYahooHistory(ticker, lookbackDays)`
  - **Upsert**: `upsertPrices(commodity, samples)` using an UNNEST insert
  - **Sync orchestration**: `syncAll(lookbackDays)` on startup and on an interval
  - **gRPC server**: implements `listPrices` + `getLatestPrice`
- `src/generated/*`: ts-proto generated types/services

### Configuration (environment variables)

- `DATABASE_URL`: Postgres connection string (**required**)
- `PORT`: gRPC port (default `50060`)
- `MARKET_PROVIDER`: provider selector (default `yahoo`)
- `SCRAPER_LOOKBACK_DAYS`: how much history to fetch on startup (default `730`)
- `SCRAPER_INTERVAL_MS`: refresh interval (default `86400000` = 24 hours)
- `LOG_LEVEL`: pino log level

### Local development

Via Docker (recommended):

```bash
docker compose up -d --build commodity-scraper
```

Or locally with tsx:

```bash
cd services/commodity-scraper
npm install
npm run dev
```

### Interactions and data flow

Notes:

- In local dev, `db/dev_seed.sql` inserts a deterministic `source='seed'` price curve so the GUI has prices even if Yahoo is unreachable.
- When Yahoo fetch succeeds, `source='yahoo'` prices will be upserted alongside `seed` prices and can be preferred at read-time.

### Design diagram (Mermaid)

```mermaid
flowchart LR
  subgraph Provider[External Provider]
    Yahoo[Yahoo Finance HTTP]
  end

  subgraph Scraper[services/commodity-scraper]
    Load[loadCommodities()]
    Fetch[fetchYahooHistory()]
    Upsert[upsertPrices()]
    GRPC[gRPC MarketDataService]
    Loop[syncAll() + interval]
  end

  subgraph DB[(Postgres)]
    Commodities[(commodities)]
    Market[(market_prices)]
  end

  Yahoo --> Fetch
  Commodities --> Load
  Load --> Loop
  Fetch --> Upsert
  Upsert --> Market
  Market --> GRPC

  subgraph Gateway[services/api-gateway]
    REST[GET /api/commodities/:id/prices]
  end

  GRPC --> Gateway
  REST --> GUI[gui]
```

### Operational notes / troubleshooting

- If Yahoo is unreachable or returns sparse data for a ticker, the scraper logs `sync failed` for that commodity but continues for others.
- If you see timestamps collapsed to 1970 in API responses, it’s usually a protobuf Timestamp serialization mismatch; verify generated Timestamp handling matches the ts-proto `google.protobuf.Timestamp` definition.


