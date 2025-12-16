import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import pino from 'pino';
import { newDb } from 'pg-mem';
import { createExtractor, PurchaseOrder } from './index.js';
import { createSimServer } from '../../erp-sim/src/index.js';

const companyId = '00000000-0000-0000-0000-000000000001';

describe('ERP extractor integration with ERP simulator webhooks', () => {
  const logger = pino({ level: 'silent' });
  const db = newDb();
  const { Pool } = db.adapters.createPg();
  const pool = new Pool();

  const staticOrders: PurchaseOrder[] = [
    {
      id: 'po-1',
      companyId,
      commodityId: 'sugar',
      commodityName: 'Sugar',
      quantity: 100,
      unit: 'lb',
      pricePerUnit: 0.5,
      currency: 'USD',
      deliveryDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'confirmed',
    },
    {
      id: 'po-2',
      companyId,
      commodityId: 'flour',
      commodityName: 'Flour',
      quantity: 200,
      unit: 'lb',
      pricePerUnit: 0.3,
      currency: 'USD',
      deliveryDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      status: 'confirmed',
    },
  ];

  let sim: ReturnType<typeof createSimServer>;
  let extractor: ReturnType<typeof createExtractor>;

  beforeAll(async () => {
    jest.setTimeout(10_000);
    // Minimal schema for extractor writes
    await pool.query(`
      CREATE TABLE raw_erp_data (
        id bigserial PRIMARY KEY,
        company_id uuid NOT NULL,
        record_type text NOT NULL,
        erp_record_id text NOT NULL,
        payload jsonb NOT NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (company_id, record_type, erp_record_id)
      );
      CREATE TABLE commodities (
        id text PRIMARY KEY,
        name text NOT NULL,
        unit text NOT NULL
      );
      CREATE TABLE erp_purchase_orders (
        id uuid PRIMARY KEY,
        company_id uuid NOT NULL,
        commodity_id text NOT NULL REFERENCES commodities(id),
        quantity numeric(18,6) NOT NULL,
        unit text NOT NULL,
        price_per_unit numeric(18,6) NOT NULL,
        currency text NOT NULL,
        delivery_date timestamptz NOT NULL,
        created_at timestamptz NOT NULL,
        status text NOT NULL,
        raw_erp_data_id bigint
      );
    `);

    await pool.query(`
      INSERT INTO commodities (id, name, unit) VALUES ('sugar', 'Sugar', 'lb'), ('flour', 'Flour', 'lb');
    `);

    sim = createSimServer({
      companyId,
      port: 4101,
      host: '127.0.0.1',
      disableGenerator: true,
      disableHistory: true,
      logger,
    });
    await sim.start();

    extractor = createExtractor({
      port: 4102,
      host: '127.0.0.1',
      companyId,
      erpBaseUrl: 'http://127.0.0.1:4101',
      publicUrl: 'http://127.0.0.1:4102',
      pollMs: 60_000, // keep polling quiet; webhook drives the test
      pool,
      logger,
    });
    await extractor.start();
  });

  afterAll(async () => {
    await extractor.stop();
    await sim.stop();
  });

  it('stores webhooked purchase orders into raw_erp_data', async () => {
    // Emit static orders via simulator and notify subscribers
    sim.pushOrders(staticOrders, true);

    // Wait until both orders are present in the DB
    const start = Date.now();
    let rows = 0;
    while (Date.now() - start < 5000) {
      const res = await pool.query(`SELECT payload->>'id' AS id FROM raw_erp_data ORDER BY id`);
      rows = res.rowCount;
      if (rows >= staticOrders.length) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(rows).toBe(staticOrders.length);
    const res = await pool.query(`SELECT payload->>'id' AS id FROM raw_erp_data ORDER BY id`);
    const ids = res.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain('po-1');
    expect(ids).toContain('po-2');
  });
});
