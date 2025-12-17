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

export type InventorySnapshot = {
  id: string;
  companyId: string;
  commodityId: string;
  commodityName: string;
  onHand: number;
  unit: string;
  asOf: string;
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

const DEFAULT_INITIAL_INVENTORY: Record<string, number> = {
  sugar: 8000,
  flour: 12000,
  butter: 2500,
  eggs: 1500,
  vanilla: 400,
  baking_soda: 900,
  salt: 1200,
  chocolate: 3200,
  milk: 700,
  yeast: 250,
  oil: 500,
  oats: 6000,
};

// Units per day (steady consumption). Weekly snapshots reduce by rate * 7.
const DEFAULT_CONSUMPTION_PER_DAY: Record<string, number> = {
  sugar: 180,
  flour: 260,
  butter: 40,
  eggs: 18,
  vanilla: 3,
  baking_soda: 4,
  salt: 3,
  chocolate: 55,
  milk: 10,
  yeast: 1.2,
  oil: 3,
  oats: 90,
};

type SimOptions = {
  companyId?: string;
  port?: number;
  host?: string;
  tickMs?: number;
  stepDays?: number;
  historyMonths?: number;
  purchaseProbabilityPerMonth?: number;
  baseCurrency?: string;
  commodities?: typeof DEFAULT_COMMODITIES;
  initialInventory?: Record<string, number>;
  consumptionPerDay?: Record<string, number>;
  staticOrders?: PurchaseOrder[];
  disableGenerator?: boolean;
  disableHistory?: boolean;
  logger?: Logger;
};

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

export function createSimServer(options: SimOptions = {}) {
  const logger = options.logger ?? pino({ level: process.env.LOG_LEVEL || 'info' });
  const app = Fastify({ logger: logger as any });

  const companyId = options.companyId || process.env.COMPANY_ID || '00000000-0000-0000-0000-000000000001';
  const port = options.port ?? Number(process.env.PORT || 4001);
  const host = options.host ?? '0.0.0.0';
  const tickMs = options.tickMs ?? Number(process.env.ERP_SIM_TICK_MS || 10000);
  const stepDays = options.stepDays ?? Number(process.env.ERP_SIM_STEP_DAYS || 7);
  const historyMonths = options.historyMonths ?? Number(process.env.ERP_SIM_HISTORY_MONTHS || 18);
  const purchaseProbabilityPerMonth =
    options.purchaseProbabilityPerMonth ??
    Number(process.env.ERP_SIM_PURCHASE_PROBABILITY || 0.65);
  const currency = options.baseCurrency || process.env.ERP_SIM_BASE_CURRENCY || 'USD';
  const commodities = options.commodities || DEFAULT_COMMODITIES;
  const initialInventory = options.initialInventory || DEFAULT_INITIAL_INVENTORY;
  const consumptionPerDay = options.consumptionPerDay || DEFAULT_CONSUMPTION_PER_DAY;

  const purchaseOrders: PurchaseOrder[] = [];
  const inventorySnapshots: InventorySnapshot[] = [];
  const subscriptions = new Set<string>();
  let interval: NodeJS.Timeout | null = null;

  function randomWithin(base: number, variationPct: number): number {
    const delta = base * variationPct * (Math.random() - 0.5) * 2;
    return Math.max(0, base + delta);
  }

  // Simulated clock (UTC) so the GUI sees realistic date ranges.
  // Start at the beginning of the current month, then backfill historyMonths.
  let simNow = startOfMonthUTC(new Date());

  // Track which months we've generated purchase orders for (per commodity).
  const generatedMonthsByCommodity = new Map<string, Set<string>>();
  commodities.forEach((c) => generatedMonthsByCommodity.set(c.id, new Set()));

  // Track deliveries that should increase inventory at delivery_date.
  type PendingDelivery = {
    commodityId: string;
    quantity: number;
    unit: string;
    deliveryDate: Date;
    purchaseOrderId: string;
  };
  const pendingDeliveries: PendingDelivery[] = [];

  // Current inventory state (mutable over simulated time)
  const inventoryByCommodity = new Map<string, number>();
  for (const c of commodities) {
    const init = initialInventory[c.id] ?? 1000;
    inventoryByCommodity.set(c.id, init);
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

  function maybeGenerateMonthlyOrder(commodity: (typeof commodities)[number], monthStart: Date) {
    const key = monthKey(monthStart);
    const already = generatedMonthsByCommodity.get(commodity.id)!;
    if (already.has(key)) return null;
    already.add(key);

    if (Math.random() > purchaseProbabilityPerMonth) return null;

    const monthEnd = endOfMonthUTC(monthStart);
    const daySpan = Math.max(1, Math.floor((monthEnd.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000)));
    const orderDayOffset = Math.floor(Math.random() * Math.min(daySpan, 28)); // keep it simple
    const createdAt = addDays(monthStart, orderDayOffset);
    const deliveryDate = addDays(createdAt, 30);

    // Quantity sized to roughly cover a month of consumption with some variance
    const monthlyNeed = (consumptionPerDay[commodity.id] ?? 10) * 30;
    const quantity = randomWithin(monthlyNeed, 0.35);
    const pricePerUnit = randomWithin(commodity.basePrice, 0.2);

    const po: PurchaseOrder = {
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

    pendingDeliveries.push({
      commodityId: commodity.id,
      quantity: po.quantity,
      unit: po.unit,
      deliveryDate,
      purchaseOrderId: po.id,
    });

    return po;
  }

  function recordWeeklyInventory(asOf: Date, inventoryByCommodity: Map<string, number>) {
    for (const commodity of commodities) {
      const onHand = inventoryByCommodity.get(commodity.id) ?? 0;
      const id = `inv_${commodity.id}_${asOf.toISOString()}`;
      inventorySnapshots.push({
        id,
        companyId,
        commodityId: commodity.id,
        commodityName: commodity.name,
        onHand: Number(onHand.toFixed(2)),
        unit: commodity.unit,
        asOf: asOf.toISOString(),
      });
    }
  }

  function bootstrapHistory(months: number) {
    // Backfill purchase orders (monthly-ish) + weekly inventory snapshots for a realistic chart.
    const nowMonthStart = startOfMonthUTC(new Date());
    const historyStart = addDays(nowMonthStart, -months * 30);
    simNow = nowMonthStart;

    // Reset inventory state to the starting values at the beginning of history
    inventoryByCommodity.clear();
    for (const c of commodities) {
      const init = initialInventory[c.id] ?? 1000;
      inventoryByCommodity.set(c.id, init);
    }

    // Generate monthly purchase orders across history window
    const generated: PurchaseOrder[] = [];
    for (let m = months; m >= 0; m -= 1) {
      const monthStart = addDays(nowMonthStart, -m * 30);
      const monthStartUTC = startOfMonthUTC(monthStart);
      for (const commodity of commodities) {
        const po = maybeGenerateMonthlyOrder(commodity, monthStartUTC);
        if (po) generated.push(po);
      }
    }
    // Keep in chronological order
    generated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    pushOrders(generated, false);

    // Weekly inventory readouts from historyStart to simNow
    let t = startOfMonthUTC(historyStart);
    // Record the initial inventory state BEFORE any consumption is applied,
    // so the first visible data point reflects the true starting level.
    recordWeeklyInventory(t, inventoryByCommodity);
    while (t.getTime() <= simNow.getTime()) {
      const next = addDays(t, stepDays);

      // Apply steady consumption over the step
      for (const c of commodities) {
        const rate = consumptionPerDay[c.id] ?? 0;
        const delta = rate * stepDays;
        const current = inventoryByCommodity.get(c.id) ?? 0;
        inventoryByCommodity.set(c.id, Math.max(0, current - delta));
      }

      // Apply any deliveries that have arrived by 'next'
      const remaining: PendingDelivery[] = [];
      for (const d of pendingDeliveries) {
        if (d.deliveryDate.getTime() <= next.getTime()) {
          const current = inventoryByCommodity.get(d.commodityId) ?? 0;
          inventoryByCommodity.set(d.commodityId, current + d.quantity);
        } else {
          remaining.push(d);
        }
      }
      pendingDeliveries.length = 0;
      remaining.forEach((d) => pendingDeliveries.push(d));

      recordWeeklyInventory(next, inventoryByCommodity);
      t = next;
    }
  }

  function advanceInventory(from: Date, to: Date) {
    // Apply steady consumption for the elapsed days (normally stepDays)
    const days = Math.max(
      0,
      Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
    );
    if (days > 0) {
      for (const c of commodities) {
        const rate = consumptionPerDay[c.id] ?? 0;
        const delta = rate * days;
        const current = inventoryByCommodity.get(c.id) ?? 0;
        inventoryByCommodity.set(c.id, Math.max(0, current - delta));
      }
    }

    // Apply any deliveries that have arrived by 'to'
    const remaining: PendingDelivery[] = [];
    for (const d of pendingDeliveries) {
      if (d.deliveryDate.getTime() <= to.getTime()) {
        const current = inventoryByCommodity.get(d.commodityId) ?? 0;
        inventoryByCommodity.set(d.commodityId, current + d.quantity);
      } else {
        remaining.push(d);
      }
    }
    pendingDeliveries.length = 0;
    remaining.forEach((d) => pendingDeliveries.push(d));

    // Record weekly readout at the end of the step
    recordWeeklyInventory(to, inventoryByCommodity);
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

  app.get('/erp/:companyId/inventory', async (request: FastifyRequest, reply: FastifyReply) => {
    const { companyId: reqCompany } = request.params as { companyId: string };
    const { since } = request.query as { since?: string };

    if (reqCompany !== companyId) {
      return reply.code(404).send({ error: 'company not found' });
    }

    const sinceDate = since ? new Date(since) : undefined;
    const results = sinceDate
      ? inventorySnapshots.filter((s) => new Date(s.asOf) > sinceDate)
      : inventorySnapshots;

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
        bootstrapHistory(historyMonths);
      }
      if (options.staticOrders) {
        pushOrders(options.staticOrders, false);
      }
      if (!options.disableGenerator) {
        interval = setInterval(() => {
          // Advance simulated time by stepDays and generate at-most-one PO per commodity per month.
          const before = simNow;
          const after = addDays(simNow, stepDays);

          // If we crossed into a new month, generate that month's orders (probabilistic).
          const beforeMonth = monthKey(before);
          const afterMonth = monthKey(after);
          if (beforeMonth !== afterMonth) {
            const monthStart = startOfMonthUTC(after);
            const generated: PurchaseOrder[] = [];
            for (const commodity of commodities) {
              const po = maybeGenerateMonthlyOrder(commodity, monthStart);
              if (po) generated.push(po);
            }
            if (generated.length > 0) {
              generated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
              pushOrders(generated, true);
            }
          }

          // Inventory is updated every tick (weekly) and snapshots are appended, so downstream
          // services can continue to ingest new inventory readouts after bootstrap.
          advanceInventory(before, after);

          simNow = after;
        }, tickMs);
      }
      const address = await app.listen({ port, host });
      logger.info(
        { port, tickMs, stepDays, historyMonths, purchaseProbabilityPerMonth, address },
        'erp-sim started'
      );
      return address;
    },
    async stop() {
      if (interval) {
        clearInterval(interval);
      }
      await app.close();
    },
    getState() {
      return { purchaseOrders, inventorySnapshots, subscriptions, simNow };
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
