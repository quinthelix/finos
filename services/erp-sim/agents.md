# ERP Simulator Service (`erp-sim`)

Purpose: simulate a customer ERP (SAP S/4HANA–style REST API) for Ugibisco so we can extract purchase data quickly in demo environments.

- Language/Runtime: TypeScript on Node.js 18+.
- HTTP: Fastify (REST only; this is treated as an external system to the platform).
- Logging: pino.
- Dev: `tsx src/index.ts`.
- Build: `esbuild` bundled for Node 18, output to `dist/`.
- Auth: none (demo external system).

API surface (initial):
- `GET /health` — basic health.
- `GET /erp/:companyId/purchase-orders?since=<ISO>` — returns simulated purchase orders; `since` filters by createdAt.
- `POST /erp/:companyId/subscriptions { callbackUrl }` — register a webhook to receive purchase order events when new orders are generated.

Simulation rules:
- Company: Ugibisco (`00000000-0000-0000-0000-000000000001`).
- Commodities: 12 cookie-related ingredients (e.g., sugar, flour, butter, eggs, etc.).
- Time acceleration: one "simulated month" per `ERP_SIM_TICK_MS` interval (default ~10s) so months pass in minutes.
- Each tick generates purchase orders per commodity with randomized quantities and prices; results are kept in-memory.
- If subscriptions exist, the simulator POSTs new orders to each `callbackUrl`.

Configuration (env):
- `PORT` (default 4001)
- `COMPANY_ID` (default Ugibisco UUID)
- `ERP_SIM_TICK_MS` (default 10000 ms per simulated month)
- `ERP_SIM_BASE_CURRENCY` (default USD)
