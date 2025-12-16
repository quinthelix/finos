# ERP Extractor Service (`erp-extractor`)

Purpose: pull purchase orders from external ERPs (here, the local `erp-sim`) and persist them into the platform DB (`raw_erp_data`). Designed to be configurable per customer/ERP instance.

- Language/Runtime: TypeScript on Node.js 18+.
- HTTP: Fastify for health + inbound webhooks.
- Logging: pino.
- Dev: `tsx src/index.ts`.
- Build: `esbuild` bundled for Node 18, output to `dist/`.
- DB: Postgres via `pg`, writing into `raw_erp_data` (record_type = `purchase_order`).

Acquisition modes:
- Webhook-first: registers a subscription with `erp-sim` (`POST /erp/:companyId/subscriptions`) if `ERP_EXTRACTOR_PUBLIC_URL` is provided; receives events at `/webhooks/erp/purchase-order`.
- Polling fallback: polls `/erp/:companyId/purchase-orders` on a schedule (default 15s). Runs even with webhooks as a gap-filler.

Configuration (env):
- `PORT` (default 4002)
- `COMPANY_ID` (default Ugibisco UUID)
- `DATABASE_URL` (Postgres)
- `ERP_SIM_BASE_URL` (default http://localhost:4001)
- `ERP_EXTRACTOR_PUBLIC_URL` (optional; when set, used to auto-register webhook)
- `ERP_EXTRACTOR_POLL_MS` (default 15000)

Stored data:
- Each purchase order is inserted into `raw_erp_data` with `record_type='purchase_order'` and the ERP payload JSON. Inserts are guarded to avoid duplicates by `payload->>'id'` per company.
