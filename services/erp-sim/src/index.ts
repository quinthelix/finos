import { randomUUID } from 'crypto';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import pino, { Logger } from 'pino';

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
  status: 'confirmed' | 'draft';
};

const DEFAULT_COMMODITIES: Array<{ id: string; name: string; unit: string; basePrice: number }> = [
  { id: 'sugar', name: 'Sugar', unit: 'lb', basePrice: 0.45 },
  { id: 'flour', name: 'Flour', unit: 'lb', basePrice: 0.35 },
  { id: 'butter', name: 'Butter', unit: 'lb', basePrice: 3.2 },
  { id: 'eggs', name: 'Eggs', unit: 'dozen', basePrice: 2.4 },
  { id: 'vanilla', name: 'Vanilla Extract', unit: 'oz', basePrice: 1.25 },
  { id: 'baking_soda', name: 'Baking Soda', unit: 'lb', basePrice: 0.8 },
  { id: 'salt', name: 'Salt', unit: 'lb', basePrice: 0.2 },
  { id: 'chocolate', name: 'Chocolate Chips', unit: 'lb', basePrice: 2.8 },
  { id: 'milk', name: 'Milk', unit: 'gal', basePrice: 3.5 },
  { id: 'yeast', name: 'Yeast', unit: 'oz', basePrice: 0.5 },
  { id: 'oil', name: 'Vegetable Oil', unit: 'gal', basePrice: 5.1 },
  { id: 'oats', name: 'Oats', unit: 'lb', basePrice: 0.9 },
];

type SimOptions = {
  companyId?: string;
  port?: number;
  host?: string;
  tickMs?: number;
  baseCurrency?: string;
  commodities?: typeof DEFAULT_COMMODITIES;
  staticOrders?: PurchaseOrder[];
  disableGenerator?: boolean;
  disableHistory?: boolean;
  logger?: Logger;
};

export function createSimServer(options: SimOptions = {}) {
  const logger = options.logger ?? pino({ level: process.env.LOG_LEVEL || 'info' });
  const app = Fastify({ logger: logger as any });

  const companyId = options.companyId || process.env.COMPANY_ID || '00000000-0000-0000-0000-000000000001';
  const port = options.port ?? Number(process.env.PORT || 4001);
  const host = options.host ?? '0.0.0.0';
  const tickMs = options.tickMs ?? Number(process.env.ERP_SIM_TICK_MS || 10000);
  const currency = options.baseCurrency || process.env.ERP_SIM_BASE_CURRENCY || 'USD';
  const commodities = options.commodities || DEFAULT_COMMODITIES;

  const purchaseOrders: PurchaseOrder[] = [];
  const subscriptions = new Set<string>();
  let interval: NodeJS.Timeout | null = null;

  function randomWithin(base: number, variationPct: number): number {
    const delta = base * variationPct * (Math.random() - 0.5) * 2;
    return Math.max(0, base + delta);
  }

  async function notifySubscribers(po: PurchaseOrder) {
    // Fire-and-forget webhook delivery for new purchase orders
    if (subscriptions.size === 0) return;
    await Promise.all(
      Array.from(subscriptions).map(async (url) => {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(po),
          });
          if (!res.ok) {
            logger.warn({ url, status: res.status }, 'webhook delivery failed');
          }
        } catch (err) {
          logger.warn({ url, err }, 'webhook delivery error');
        }
      })
    );
  }

  function pushOrders(orders: PurchaseOrder[], notify = true) {
    orders.forEach((po) => purchaseOrders.push(po));
    if (notify) {
      orders.forEach((po) => notifySubscribers(po).catch((err) => logger.warn({ err }, 'notification error')));
    }
  }

  function generateMonthlyOrders(tick: number) {
    // Create one PO per commodity for the current simulated month
    const createdAt = new Date();
    const generated: PurchaseOrder[] = commodities.map((commodity) => {
      const quantity = randomWithin(1200, 0.4); // lbs/gal/etc per simulated month
      const pricePerUnit = randomWithin(commodity.basePrice, 0.2);
      const deliveryDate = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        id: randomUUID(),
        companyId,
        commodityId: commodity.id,
        commodityName: commodity.name,
        quantity: Number(quantity.toFixed(2)),
        unit: commodity.unit,
        pricePerUnit: Number(pricePerUnit.toFixed(4)),
        currency,
        deliveryDate: deliveryDate.toISOString(),
        createdAt: createdAt.toISOString(),
        status: 'confirmed',
      };
    });
    pushOrders(generated, true);
    logger.info({ tick, generated: commodities.length }, 'simulated month generated');
  }

  function bootstrapHistory(months: number) {
    // Seed historical POs so extractor has backfill data on startup
    for (let i = months; i > 0; i -= 1) {
      const historicalCreatedAt = new Date(Date.now() - i * tickMs);
      const batch: PurchaseOrder[] = commodities.map((commodity) => {
        const quantity = randomWithin(1200, 0.2);
        const pricePerUnit = randomWithin(commodity.basePrice, 0.1);
        const deliveryDate = new Date(historicalCreatedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        return {
          id: randomUUID(),
          companyId,
          commodityId: commodity.id,
          commodityName: commodity.name,
          quantity: Number(quantity.toFixed(2)),
          unit: commodity.unit,
          pricePerUnit: Number(pricePerUnit.toFixed(4)),
          currency,
          deliveryDate: deliveryDate.toISOString(),
          createdAt: historicalCreatedAt.toISOString(),
          status: 'confirmed',
        };
      });
      pushOrders(batch, false);
    }
  }

  app.get('/health', async () => ({ status: 'ok' }));

  app.get('/erp/:companyId/purchase-orders', async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId: reqCompany } = request.params as { companyId: string };
    const { since } = request.query as { since?: string };

    if (reqCompany !== companyId) {
      return reply.code(404).send({ error: 'company not found' });
    }

    const sinceDate = since ? new Date(since) : undefined;
    const results = sinceDate
      ? purchaseOrders.filter((po) => new Date(po.createdAt) > sinceDate)
      : purchaseOrders;

    return { data: results };
  });

  app.post('/erp/:companyId/subscriptions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId: reqCompany } = request.params as { companyId: string };
    if (reqCompany !== companyId) {
      return reply.code(404).send({ error: 'company not found' });
    }
    const body = request.body as { callbackUrl?: string };
    if (!body.callbackUrl) {
      return reply.code(400).send({ error: 'callbackUrl required' });
    }
    subscriptions.add(body.callbackUrl);
    logger.info({ callbackUrl: body.callbackUrl }, 'subscription added');
    return { status: 'ok' };
  });

  return {
    app,
    pushOrders,
    async start() {
      if (!options.disableHistory) {
        bootstrapHistory(3);
      }
      if (options.staticOrders) {
        pushOrders(options.staticOrders, false);
      }
      if (!options.disableGenerator) {
        let tick = 0;
        interval = setInterval(() => {
          tick += 1;
          generateMonthlyOrders(tick);
        }, tickMs);
      }
      const address = await app.listen({ port, host });
      logger.info({ port, tickMs, address }, 'erp-sim started');
      return address;
    },
    async stop() {
      if (interval) {
        clearInterval(interval);
      }
      await app.close();
    },
    getState() {
      return { purchaseOrders, subscriptions };
    },
  };
}

// Default start when not under test
if (process.env.NODE_ENV !== 'test') {
  createSimServer()
    .start()
    .catch((err) => {
      const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
      logger.error({ err }, 'failed to start erp-sim');
      process.exit(1);
    });
}
