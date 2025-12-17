import Fastify from 'fastify';
import pino, { Logger } from 'pino';
import { Pool } from 'pg';
import { startGrpcServer } from './grpcServer.js';

export type PurchaseOrder = {
  id: string;
  companyId: string;
  commodityId: string;
  commodityName: string;
  quantity: number;
  unit: string;
  pricePerUnit: number;
  currency: string;
  deliveryDate: string;
  createdAt: string;
  status: 'in_approval' | 'executed' | 'supplied';
};

export type InventorySnapshot = {
  id: string;
  companyId: string;
  commodityId: string;
  commodityName: string;
  onHand: number;
  unit: string;
  asOf: string;
};

type ExtractorOptions = {
  port?: number;
  host?: string;
  companyId?: string;
  erpBaseUrl?: string;
  publicUrl?: string;
  pollMs?: number;
  pool?: Pool;
  logger?: Logger;
};

export function createExtractor(options: ExtractorOptions = {}) {
  const logger = options.logger ?? pino({ level: process.env.LOG_LEVEL || 'info' });
  const app = Fastify({ logger: logger as any });

  const PORT = options.port ?? Number(process.env.PORT || 4002);
  const GRPC_PORT = Number(process.env.ERP_EXTRACTOR_GRPC_PORT || 50051);
  const HOST = options.host ?? '0.0.0.0';
  const COMPANY_ID = options.companyId || process.env.COMPANY_ID || '00000000-0000-0000-0000-000000000001';
  const ERP_BASE_URL = options.erpBaseUrl || process.env.ERP_SIM_BASE_URL || 'http://localhost:4001';
  const PUBLIC_URL = options.publicUrl || process.env.ERP_EXTRACTOR_PUBLIC_URL;
  const POLL_MS = options.pollMs ?? Number(process.env.ERP_EXTRACTOR_POLL_MS || 15000);
  const DATABASE_URL = process.env.DATABASE_URL || 'postgres://app:app@localhost:5432/app';

  const pool = options.pool ?? new Pool({ connectionString: DATABASE_URL });
  let lastSync = new Date(0);
  let lastInventorySync = new Date(0);
  let pollHandle: NodeJS.Timeout | null = null;
  let grpcServer: { server: import('@grpc/grpc-js').Server; address: string } | null = null;

  async function upsertRawAndStructured(po: PurchaseOrder) {
    // Insert into raw_erp_data and structured erp_purchase_orders in one transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const payload = JSON.stringify(po);
      const rawRes = await client.query(
        `
        WITH ins AS (
          INSERT INTO raw_erp_data (company_id, record_type, payload)
          VALUES ($1, 'purchase_order', $2::jsonb)
          ON CONFLICT (company_id, record_type, erp_record_id) DO NOTHING
          RETURNING id
        ), existing AS (
          SELECT id FROM ins
          UNION
          SELECT id FROM raw_erp_data
          WHERE company_id = $1 AND record_type = 'purchase_order' AND erp_record_id = $3
          LIMIT 1
        )
        SELECT id FROM existing;
        `,
        [COMPANY_ID, payload, po.id]
      );

      const rawId = rawRes.rows[0]?.id as number | undefined;

      await client.query(
        `
        INSERT INTO erp_purchase_orders (
          id, company_id, commodity_id, quantity, unit, price_per_unit, currency,
          delivery_date, created_at, status, raw_erp_data_id
        ) VALUES (
          $1::uuid, $2, $3, $4, $5, $6, $7,
          $8::timestamptz, $9::timestamptz, $10, $11
        )
        ON CONFLICT (id) DO NOTHING;
        `,
        [
          po.id,
          COMPANY_ID,
          po.commodityId,
          po.quantity,
          po.unit,
          po.pricePerUnit,
          po.currency,
          po.deliveryDate,
          po.createdAt,
          po.status,
          rawId ?? null,
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function storeOrders(orders: PurchaseOrder[]) {
    // Persist all orders and advance lastSync to the newest createdAt
    for (const po of orders) {
      try {
        await upsertRawAndStructured(po);
      } catch (err) {
        logger.error({ err, poId: po.id }, 'failed to store purchase order');
      }
    }
    const newest = orders.reduce<Date | null>((latest, po) => {
      const created = new Date(po.createdAt);
      return !latest || created > latest ? created : latest;
    }, null);
    if (newest && newest > lastSync) {
      lastSync = newest;
    }
  }

  async function upsertRawAndStructuredInventory(snapshot: InventorySnapshot) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const payload = JSON.stringify(snapshot);
      const rawRes = await client.query(
        `
        WITH ins AS (
          INSERT INTO raw_erp_data (company_id, record_type, payload)
          VALUES ($1, 'inventory_snapshot', $2::jsonb)
          ON CONFLICT (company_id, record_type, erp_record_id) DO NOTHING
          RETURNING id
        ), existing AS (
          SELECT id FROM ins
          UNION
          SELECT id FROM raw_erp_data
          WHERE company_id = $1 AND record_type = 'inventory_snapshot' AND erp_record_id = $3
          LIMIT 1
        )
        SELECT id FROM existing;
        `,
        [COMPANY_ID, payload, snapshot.id]
      );
      const rawId = rawRes.rows[0]?.id as number | undefined;

      await client.query(
        `
        INSERT INTO erp_inventory_snapshots (
          company_id, commodity_id, on_hand, unit, as_of, raw_erp_data_id
        ) VALUES (
          $1, $2, $3, $4, $5::timestamptz, $6
        )
        ON CONFLICT (company_id, commodity_id, as_of) DO NOTHING;
        `,
        [COMPANY_ID, snapshot.commodityId, snapshot.onHand, snapshot.unit, snapshot.asOf, rawId ?? null]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function storeInventory(snapshots: InventorySnapshot[]) {
    for (const s of snapshots) {
      try {
        await upsertRawAndStructuredInventory(s);
      } catch (err) {
        // snapshot.id is synthetic; log it for debugging
        logger.error({ err, snapshotId: s.id }, 'failed to store inventory snapshot');
      }
    }
    const newest = snapshots.reduce<Date | null>((latest, s) => {
      const asOf = new Date(s.asOf);
      return !latest || asOf > latest ? asOf : latest;
    }, null);
    if (newest && newest > lastInventorySync) {
      lastInventorySync = newest;
    }
  }

  async function fetchPurchaseOrders(since?: Date): Promise<PurchaseOrder[]> {
    // Pull purchase orders from the simulator (optionally since a timestamp)
    const url = new URL(`/erp/${COMPANY_ID}/purchase-orders`, ERP_BASE_URL);
    if (since) {
      url.searchParams.set('since', since.toISOString());
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`erp-sim fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as { data: PurchaseOrder[] };
    return body.data ?? [];
  }

  async function fetchInventory(since?: Date): Promise<InventorySnapshot[]> {
    const url = new URL(`/erp/${COMPANY_ID}/inventory`, ERP_BASE_URL);
    if (since) {
      url.searchParams.set('since', since.toISOString());
    }
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`erp-sim inventory fetch failed: ${res.status}`);
    }
    const body = (await res.json()) as { data: InventorySnapshot[] };
    return body.data ?? [];
  }

  async function pollLoop() {
    // Periodic poll to catch up on any missed or new orders + inventory
    try {
      const orders = await fetchPurchaseOrders(lastSync);
      if (orders.length > 0) {
        logger.info({ count: orders.length }, 'polled purchase orders');
        await storeOrders(orders);
      }

      const snapshots = await fetchInventory(lastInventorySync);
      if (snapshots.length > 0) {
        logger.info({ count: snapshots.length }, 'polled inventory snapshots');
        await storeInventory(snapshots);
      }
    } catch (err) {
      logger.warn({ err }, 'polling error');
    }
  }

  async function registerWebhook(effectivePublicUrl: string | undefined) {
    // Register this extractor as a webhook consumer if a public URL is configured
    if (!effectivePublicUrl) return false;
    const callbackUrl = `${effectivePublicUrl}/webhooks/erp/purchase-order`;
    try {
      const res = await fetch(`${ERP_BASE_URL}/erp/${COMPANY_ID}/subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callbackUrl }),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'webhook registration failed');
        return false;
      }
      logger.info({ callbackUrl }, 'webhook registered with erp-sim');
      return true;
    } catch (err) {
      logger.warn({ err }, 'webhook registration error');
      return false;
    }
  }

  app.get('/health', async () => ({ status: 'ok', lastSync, lastInventorySync }));

  app.post('/webhooks/erp/purchase-order', async (request, reply) => {
    const body = request.body as PurchaseOrder;
    await storeOrders([body]);
    return reply.code(202).send({ status: 'accepted' });
  });

  return {
    app,
    async start() {
      await pool.query('SELECT 1');

      const address = await app.listen({ port: PORT, host: HOST });
      const serverPort = (app.server.address() as any).port as number;
      const effectivePublicUrl = PUBLIC_URL || `http://127.0.0.1:${serverPort}`;
      const webhookActive = await registerWebhook(effectivePublicUrl);

      pollHandle = setInterval(pollLoop, POLL_MS);
      grpcServer = await startGrpcServer(pool, HOST, GRPC_PORT);

      logger.info({ pollMs: POLL_MS, webhookActive, address, grpc: grpcServer.address }, 'erp-extractor started');

      return { port: serverPort, address };
    },
    async stop() {
      if (pollHandle) {
        clearInterval(pollHandle);
      }
      if (grpcServer) {
        grpcServer.server.forceShutdown();
        grpcServer = null;
      }
      await app.close();
      await pool.end();
    },
    getState() {
      return { lastSync };
    },
  };
}

// Default start when not under test
if (process.env.NODE_ENV !== 'test') {
  createExtractor()
    .start()
    .catch((err) => {
      const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
      logger.error({ err }, 'failed to start erp-extractor');
      process.exit(1);
    });
}
