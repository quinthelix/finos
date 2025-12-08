# Project Agents Guide (`agents.md`)

> **Purpose:** This document tells human and AI coding agents what this repository is, how it should evolve, and what rules must be respected.
> We start with **local-only development** and a **monorepo**, then grow into
> Fly.io + Supabase and, later, multi-repo if needed.

---

## 1. Concept & Vision

This project is a **proof-of-concept commodity hedging platform** for companies with exposure to commodity price risk (e.g. sugar for a cookie company, fuel for a transport company, metals for a manufacturer).

The PoC demonstrates:

- Ingesting **commodity market prices**.
- Simulating **ERP data** and extracting **exposure**.
- Calculating **risk metrics** based on exposure + markets.
- Integrating with **trading APIs** via a connector abstraction (with a local simulator first).
- A **GUI** that shows company activity, risk, and trades, and allows placing new trades.

Architecture goals:

- **Monorepo first but prepared for multi repo**, each service with its own build and agent.md file in its own folder.
- **Microservices** communicating via **gRPC/protobuf** (internally).
- **Containers** for each service, build docker to github registry; deployable to **Fly.io**.
- **Postgres** as shared persistence:
  - Local dev: Postgres in Docker with persistent volume.
  - Remote: **Supabase** (managed Postgres + Auth + REST API).
- Auth handled via **Supabase Auth**, enforced primarily at the **api-gateway** and propagated to services.

---

## 2. Planned Repository Structure

> This is the *target* structure. It's ok if early iterations are smaller and Codex gradually scaffolds this.

```text
.
├─ agents.md                 # This file – global rules & architecture
├─ protos/                   # All protobuf definitions (single source of truth)
│   ├─ common.proto
│   ├─ market_data.proto
│   ├─ exposure.proto
│   ├─ risk.proto
│   ├─ trade.proto
│   └─ auth.proto (optional later)
├─ services/
│   ├─ commodity-scraper/
│   │                        # Pulls commodity market price from 3rd party service.
│   │                        # Configurable on which 3rd party to use. Can be multiple 3rd parties.
│   │                        # A container instance for each.
│   │
│   ├─ erp-sim/              # Simulated customer ERP (external system)
│   │
│   ├─ erp-extractor/        # Our connector to ERPs. A configurable instance per customer.
│   │
│   ├─ risk-engine/
│   │
│   ├─ trade-gateway/        # Provides the full API to trade and selects internally
│   │  │                     # which broker to use.
│   │  └─ providers/         # Connectors of broker providers.
│   │                        # As a first step we will implement only the broker-sim connector.
│   │
│   ├─ broker-sim/           # A simulation of a trade broker. Simulates an API to a real broker.
│   │
│   ├─ api-gateway/          # Public REST API / BFF for GUI
│   │
│   └─ auth-service/         # (optional) internal auth helper, if needed later
│
├─ gui/                      # Frontend (React SPA)
│
├─ db/
│   └─ migrations/           # SQL migrations (shared schema)
│
├─ config/
│   ├─ env.local.example     # Local-only env template
│   ├─ env.remote.example    # Fly+Supabase env template
│   └─ README.md
│
├─ docker-compose.yml        # Local dev orchestration (Postgres + services)

```

**RULE (for all agents):**

- **Follow the folder structure**. If you feel more folders are needed ask for approval and update this file.
- All `.proto` go under **`./protos/`** only; services must import from there.

---

## 3. Technology & Conventions

### 3.1 Backend microservices (`services/*`)

The backend consists of several microservices as defined in the repository
structure. Most services use **TypeScript / Node.js** for communication, scraping,
database operations, orchestration, and API handling. Services that require
heavy mathematical or statistical modeling are implemented in **Python**.

Each service MUST have its own `agents.md` describing its language and framework
choices.

#### 3.1.1 TypeScript / Node.js Service Rules

If a service declares itself to be **TypeScript / Node.js**, then it
MUST follow the rules below.

##### 3.1.1.1 Language & Runtime

- Must use **TypeScript** (strict mode enabled).
- Must run on **Node.js 18+** (matching Fly.io default runtime).

##### 3.1.1.2 HTTP Framework

- All REST endpoints must be implemented using **Fastify**.
- Fastify should be used for:
  - public service endpoints
  - internal admin/debug endpoints (e.g., health checks)

##### 3.1.1.3 RPC / Inter-Service Communication

- All service-to-service APIs are defined in `.proto` files under the root `protos/` folder.
- These protobuf definitions are the **single source of truth** for internal API contracts.
- Generate gRPC client/server code using:
  1. **`@grpc/grpc-js`**
  2. **`ts-proto`** or equivalent (must produce idiomatic TS types)
- Services should expose gRPC servers OR be gRPC clients where defined in their `agents.md`.
- **Note:** REST is allowed for external systems simulations which are ERP sim, external brokers sim,
  but **internal communication should prefer gRPC** unless specified.

##### 3.1.1.4 Build & Packaging (Production)

- All production builds MUST use **esbuild**.
- Production build output MUST be a single optimized JS file or a small folder bundle.
- No TypeScript runtime should be included in production containers.
- Type checking must still occur in CI or local dev using:

  ```bash
  tsc --noEmit
  ```

- Every service MUST provide a Dockerfile that:
  1. Copies built JS
  2. Runs on a minimal Node base image (e.g. node:18-slim)
  3. Starts the service with node dist/app.js

##### 3.1.1.5 Development Workflow

- Local development MUST use tsx:

  ```bash
  tsx src/index.ts
  ```

- Hot reload may be provided using tsx --watch.
- No service should rely on ts-node or ts-node-dev.

##### 3.1.1.6 Coding Standards

- Use ESLint + Prettier for formatting and linting.
- TypeScript must be strict:

  ```json
  "compilerOptions": {
    "strict": true
  }
  ```

- No circular imports.
- Shared types should come from .proto-generated code or a shared utilities package.
- Log using **pino**.

#### 3.1.2 Python Service Rules

If a service declares Python in its agents.md:

- Must use FastAPI for HTTP API framework.
- Must expose REST or gRPC endpoints for gateway consumption.
- Must have its own pyproject.toml.
- Must use uv tool as package, builder and runner.
- Must build to a dockerized application.
- Log using **structlog**.

### 3.2 Frontend

The frontend code is developed in `gui` folder under the root. It must also have an `agents.md` file describing its purpose and design.

- Language is **TypeScript**
- Framework is **React**
- Bundler is **Vite**
- Testing framework is **Vitest**
- Log using **console** and **loglevel**

### 3.3 Rules for all services and containers

#### 3.3.1 Environment Variables & Configuration for all services

Every service must use environment variables for:

1. Database connection
2. gRPC upstream service addresses
3. Ports
4. Feature flags (if any)

- Include correlation IDs (e.g. `requestId`) for cross-service debugging.

### 3.4 Databases

We will use Postgres standard as a relational database. In development env the container will be run. In production env we will connect to the Supabase account.

- Local: **Postgres 16** in Docker.
- Remote: **Supabase Postgres**.
- Migrations: SQL files in `db/migrations/` + simple migration runner (to be defined in `db/agents.md`).

### 3.5 Communication

- **Service-service:** gRPC with protobuf, on internal network only.
- **Frontend-backend:** REST/JSON to the **api-gateway**.
- **ERP-sim:** is treated as an **external system**:
  - Only `erp-extractor` talks to it (no GUI direct access).
- **Broker-sim:** is accessed via provider in `trade-gateway`.

---

## 4. Service Responsibilities (Architecture Level)

This section encodes decisions (1-4) that MUST be respected:

1. All global rules live here at root; per-service `agents.md` files must not contradict this.
2. `erp-sim` simulates the customer ERP; it owns tables and its own API, and is **not behind the api-gateway**.
3. Trading is done via a **trade-gateway** with a pluggable provider abstraction, including a **broker-sim** provider that mimics a real trading API.
4. Auth is handled via Supabase Auth (Phase 1), with the api-gateway enforcing access control and propagating `company_id`/roles to internal services.

### 4.1 `commodity-scraper` (internal)

- **Purpose:** Fetch commodity market prices from 3rd-party APIs or mock sources, normalize them, and store them.
- **Data Ownership:** Writes to: `market_prices` table in Postgres. Typical fields: `commodity_id`, `price`, `currency`, `unit`, `timestamp`, `source`. To be defined in its own agents.md file. Export reading this data via gRPC.
- **API:** Enables to get commodity price from db based on name, id and timestamp.
- **Used by:** Other services: `risk-engine`, `trade-gateway`, `api-gateway` use this via gRPC.

### 4.2 `erp-sim` (simulated customer ERP, external from our platform's POV)

- **Purpose:** Simulate a real customer ERP system (our platform does NOT own this).
- **Data Ownership:** Owns "raw ERP" style tables:
  - Purchase orders, inventory, forecast, maybe BOM.
- **API:** Exposes **REST API** only to `erp-extractor` using REST. This API is **NOT behind the api-gateway**. e.g:
  - `GET /erp/{companyId}/purchase-orders`
  - `GET /erp/{companyId}/inventory`
  - `GET /erp/{companyId}/forecast`
- **Used by:** `erp-extractor`, just like it would to SAP/NetSuite/etc.

### 4.3 `erp-extractor` (ERP connector / scraper)

- **Purpose:** Connect to one or more ERPs (starting with `erp-sim`), pull customer data, normalize exposure.
- **Data Ownership:** Writes customer specific ERP extracted data, in records to `company_id` `raw_erp` in Postgres.
- **API:** Enables reading the customer specific ERP data from the Postgres DB.
- **Used by:** `risk-engine` (via `api-gateway`) in order to get data for exposure calculation, and by `gui` (via `api-gateway`) to present to customer.

### 4.4 `risk-engine`

- **Purpose:** Calculates and stores various risk exposures to the company based on its purchasing plan from the ERP.
- **Data Ownership:** Writes customer risk calculations to table `exposures` in the database.
- **API:** Enables calculating and reading the customer exposures based on purchase plan, market prices and forecasts.
- **Used by:** `gui` (via `api-gateway`) to trigger risk calculations, retrieve the results in order to present them visually.

### 4.5 `trade-gateway` (centralized trade API encapsulating different providers)

- **Purpose:** Provide a **platform-level trade API** and hide the specifics of external trading APIs behind a connector/provider abstraction.
- **Data Ownership:** Writes `trades` and `positions` tables in database for history analysis.
- **API:** Perform trade on specific commodities financial tools such as futures and options.
- **Used by:** `gui` (via `api-gateway`) to initiate a trade operation via one of the providers, or to get historic trade actions in order to present it visually.

### 4.6 `providers` (trade broker implementations)

- **Purpose:** Specific broker connection implementation. The `trade-gateway` uses it to perform actions against an external broker. Each 3rd party broker should have an implementation of a provider.
- **Data Ownership:** TBD
- **API:** TBD to decide on common API for this layer.
- **Used by:** `trade-gateway` only, in order to initiate trade using a specific broker, and get its results.

### 4.7 `broker-sim` (simulated broker)

- **Purpose:** A simulation of a real trade broker. Mimics known broker API semantics (order ID, status, fills). Executes trades using current market price from `commodity-scraper`.
- **Data Ownership:** Writes orders/trades/positions into our DB via the `trade-gateway` provider interface.
- **API:** Exposes **REST API** that mimics a real broker's API. Only accessed by the `broker-sim` provider inside `trade-gateway`.
- **Used by:** `trade-gateway` (via the `broker-sim` provider) for local development and testing.

### 4.8 `api-gateway` (API gateway / backend-for-frontend)

- **Purpose:** Single entry point for the GUI and any external clients.
- **API:** Exposes **REST/JSON API**:
  - `GET /api/company/{id}/risk`
  - `GET /api/company/{id}/exposures`
  - `GET /api/commodities/{id}/prices`
  - `GET /api/company/{id}/positions`
  - `POST /api/trades`
- **Responsibilities:**
  - Phase 0: Plainly enter `company_id`, `user_id` from caller for demo purposes.
  - Phase 1: Verifies JWT from Supabase Auth, extracts `company_id`, `user_id`, `roles`.
  - Enforces basic authorization (user belongs to company).
  - Calls underlying services via gRPC, always passing `company_id`.
- **Used by:** `gui` only. GUI should only talk to the **api-gateway**, not to other services directly.

### 4.9 `gui` (frontend)

- **Purpose:** User-facing interface for the platform. Shows the user the company summary, deep dive on commodities, exposures, positions and trade actions.
- **Views:** To be detailed in folder specific agents.md file.
- **Used by:** End users via web browser.

---

## 5. Environments & Configuration

The codebase builds in support for:

- **Local development** uses docker-compose and local container registry, persistent volumes for db.
- **Remote PoC** (Fly.io + Supabase) uses github container registry, Supabase for persistent data.

### 5.1 Env variables (to be filled in)

| Variable                   | Description                                    | Local dev example                        | Remote (Fly + Supabase) example              |
| -------------------------- | ---------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| `NODE_ENV`                 | Standard Node env                              | `development`                            | `production`                                 |
| `ENVIRONMENT`              | Logical env                                    | `local`                                  | `remote`                                     |
| `DATABASE_URL`             | Postgres connection                            | `postgres://app:app@localhost:5432/app`  | `postgres://<SUPABASE_DB_URL>`               |
| `SUPABASE_URL`             | Supabase project URL                           | *(leave empty or dummy)*                 | `https://<PROJECT>.supabase.co`              |
| `SUPABASE_ANON_KEY`        | Public anon key (GUI)                          | *(leave empty locally)*                  | `...`                                        |
| `SUPABASE_SERVICE_KEY`     | Service key (backends, secure ops)             | *(leave empty locally)*                  | `...`                                        |
| `GATEWAY_PUBLIC_URL`       | Public URL for api-gateway                     | `http://localhost:8080`                  | `https://<fly-app-name>.fly.dev`             |
| `MARKET_SCRAPER_INTERVAL`  | Scrape interval (ms or cron)                   | `60000`                                  | `60000` or slower                            |
| `TRADE_PROVIDER`           | Trade provider selection                       | `sim`                                    | `sim` / `ib` / `...` (future)                |
| `JWT_AUDIENCE`             | Expected JWT audience (auth, later)            | *(placeholder)*                          | `authenticated` or Supabase setting          |
| `JWT_ISSUER`               | Expected JWT issuer (auth, later)              | *(placeholder)*                          | `https://<PROJECT>.supabase.co/auth/v1`      |
| `JWT_JWKS_URL`             | URL to fetch JWKS for JWT verification (later) | *(placeholder)*                          | From Supabase project (for api-gateway)      |

Files:

- `config/env.local.example` - template for local env.
- `config/env.remote.example` - template for Fly+Supabase env.

### 5.2 Local dev: Postgres in Docker

Local DB is for fast iteration & debugging.

Example `docker-compose.yml` snippet (to be created):

```yaml
version: "3.9"
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app
      POSTGRES_DB: app
    ports:
      - "5432:5432"
    volumes:
      - ./db/local_data:/var/lib/postgresql/data
```

All services should use `DATABASE_URL` to connect.

### 5.3 Remote: Supabase + Fly.io

Remote deployment:

- Supabase hosts:
  - Postgres DB.
  - Auth & optional REST.
- Fly.io hosts:
  - Each microservice container.
  - `api-gateway` as the only public HTTP endpoint for the platform.

Services use `DATABASE_URL` pointing to Supabase; we do **not** run Postgres on Fly for this PoC.

---

## 6. Auth & Multi-Tenancy Design

We phase auth but fix design now so code is consistent.

### Phase 0 - No real auth (initial PoC)

- `gui` uses a default `company_id` (e.g. `DEMO_CO`).
- `api-gateway` hard-codes `company_id` for all internal calls.
- Internal services trust `company_id` input from api-gateway.

### Phase 1 - Supabase Auth + JWT verification at api-gateway

- `gui` uses Supabase Auth:
  - `SUPABASE_URL` + `SUPABASE_ANON_KEY`.
  - Gets JWT on login.
- `api-gateway`:
  - Verifies JWT using JWKS from Supabase.
  - Extracts `user_id`, `email`, `roles`.
  - Maps user to `company_id` (via DB table).
  - Enforces that requests only access data for that `company_id`.
  - Passes `company_id` (and optionally `user_id`) to internal services (as fields or metadata).
- Internal services:
  - Filter queries by `company_id` (`WHERE company_id = $1`) for multi-tenant isolation.

**Schema rule:** Tables like `exposures`, `trades`, `positions` must include a `company_id` column where applicable.

---

## 7. Protobuf & API Contracts

All `*.proto` files live in `./protos/`.

Planned:

- `common.proto` - shared messages (e.g. `Money`, `CommodityId`, `Timestamp`).
- `market_data.proto` - `MarketDataService`.
- `exposure.proto` - `ExposureService`.
- `risk.proto` - `RiskService`.
- `trade.proto` - `TradeService`.
- `auth.proto` - optional; common auth metadata.

**Rules:**

1. Only define/change protobufs in `./protos/`.
2. Regenerate TypeScript stubs for all affected services after proto changes.
3. Prefer shared messages in `common.proto` instead of duplication.
4. Avoid circular references between service APIs.

---

## 8. Rules for AI Coding Agents

When modifying or extending this repo:

1. **Respect this file** as the authoritative source of architecture and rules.
2. Keep everything in a **single monorepo** unless explicitly instructed to split.
3. Place all protobufs under `./protos/`; do not create service-local proto copies.
4. Use a **single shared DB schema** via `db/migrations/`; no per-service DBs.
5. Use **env vars** for configuration; never hard-code secrets or URLs.
6. Treat `erp-sim` as an **external system**; only `erp-extractor` should call it.
7. Implement trading integrations via `trade-gateway` providers; do not call brokers from api-gateway or GUI.
8. Design for **multi-tenancy**: include `company_id` in DB schema and APIs where relevant.
9. Prefer small, isolated changes: implement one service/API slice with tests before doing cross-cutting refactors.
10. If you need to deviate from these rules, update this `agents.md` with the new decisions before changing code.
