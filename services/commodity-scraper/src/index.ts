import { Server, ServerCredentials } from '@grpc/grpc-js';
import pino from 'pino';
import { Pool } from 'pg';
import {
  MarketDataServiceService,
  type MarketDataServiceServer,
  type ListPricesRequest,
  type ListPricesResponse,
  type GetLatestPriceRequest,
  type GetLatestPriceResponse,
  type PricePoint,
} from './generated/market_data.js';

type CommodityRow = {
  id: string;
  display_name: string;
  unit: string;
  ticker: string;
  provider: string;
};

type PriceSample = {
  asOf: Date;
  price: number;
  currency: string;
};

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DEFAULT_LOOKBACK_DAYS = Number(process.env.SCRAPER_LOOKBACK_DAYS || 730);
const DEFAULT_INTERVAL_MS = Number(process.env.SCRAPER_INTERVAL_MS || 86_400_000); // 24h
const DEFAULT_PROVIDER = process.env.MARKET_PROVIDER || 'yahoo';
const PORT = Number(process.env.PORT || 50060);

async function loadCommodities(provider: string): Promise<CommodityRow[]> {
  const res = await pool.query<CommodityRow>(
    `SELECT id, display_name, unit, ticker, provider
     FROM commodities
     WHERE provider = $1
     ORDER BY id`,
    [provider]
  );
  return res.rows;
}

async function fetchYahooHistory(ticker: string, lookbackDays: number): Promise<PriceSample[]> {
  // Use range-based endpoint (1d interval, up to 2y history).
  const range = lookbackDays >= 720 ? '2y' : `${Math.max(1, Math.min(lookbackDays, 720))}d`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=${range}&interval=1d`;

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`yahoo fetch failed ${resp.status} for ${ticker}`);
  }
  const json = (await resp.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result?.timestamp || !result?.indicators?.quote?.[0]?.close) {
    throw new Error(`missing price data for ${ticker}`);
  }
  const ts: number[] = result.timestamp;
  const closes: (number | null)[] = result.indicators.quote[0].close;
  const currency = result.meta?.currency || 'USD';

  const samples: PriceSample[] = [];
  ts.forEach((t, idx) => {
    const price = closes[idx];
    if (price === null || price === undefined) return;
    samples.push({ asOf: new Date(t * 1000), price, currency });
  });
  return samples;
}

async function upsertPrices(commodity: CommodityRow, samples: PriceSample[]): Promise<number> {
  if (samples.length === 0) return 0;
  const client = await pool.connect();
  try {
    // We cannot use a single parameter for price/currency per row with this SQL shape.
    // Use UNNEST-style arrays instead to keep it simple.
    const sql = `
      INSERT INTO market_prices (commodity_id, price, currency, unit, source, as_of)
      SELECT * FROM UNNEST (
        $1::text[],
        $2::numeric[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::timestamptz[]
      )
      ON CONFLICT (commodity_id, as_of, source)
      DO UPDATE SET price = EXCLUDED.price, currency = EXCLUDED.currency, unit = EXCLUDED.unit;
    `;

    const commodityIds = samples.map(() => commodity.id);
    const prices = samples.map((s) => s.price);
    const currencies = samples.map((s) => s.currency);
    const units = samples.map(() => commodity.unit);
    const sources = samples.map(() => commodity.provider);
    const dates = samples.map((s) => s.asOf);

    const res = await client.query(sql, [commodityIds, prices, currencies, units, sources, dates]);
    return res.rowCount || 0;
  } finally {
    client.release();
  }
}

async function syncCommodity(commodity: CommodityRow, lookbackDays: number): Promise<void> {
  logger.info({ commodity: commodity.id }, 'sync start');
  let samples: PriceSample[] = [];
  switch (commodity.provider) {
    case 'yahoo':
      samples = await fetchYahooHistory(commodity.ticker, lookbackDays);
      break;
    default:
      throw new Error(`unsupported provider ${commodity.provider}`);
  }
  await upsertPrices(commodity, samples);
  logger.info({ commodity: commodity.id, points: samples.length }, 'sync done');
}

async function syncAll(lookbackDays: number): Promise<void> {
  const commodities = await loadCommodities(DEFAULT_PROVIDER);
  for (const c of commodities) {
    try {
      await syncCommodity(c, lookbackDays);
    } catch (err) {
      logger.error({ err, commodity: c.id }, 'sync failed');
    }
  }
}

const serviceImpl: MarketDataServiceServer = {
  listPrices: async (call, callback) => {
    const req: ListPricesRequest = call.request;
    if (!req.commodityId) return callback(new Error('commodity_id required'), null as any);
    const limit = req.limit && req.limit > 0 ? Math.min(req.limit, 5000) : 500;
    const params: any[] = [req.commodityId];
    const where: string[] = ['commodity_id = $1'];
    let idx = 2;
    if (req.start) {
      where.push(`as_of >= $${idx++}`);
      params.push(req.start);
    }
    if (req.end) {
      where.push(`as_of <= $${idx++}`);
      params.push(req.end);
    }
    const sql = `
      SELECT commodity_id, price, currency, unit, COALESCE(source, 'unknown') as source, as_of
      FROM market_prices
      WHERE ${where.join(' AND ')}
      ORDER BY as_of DESC
      LIMIT ${limit}
    `;
    try {
      const res = await pool.query(sql, params);
      const prices: PricePoint[] = res.rows.map((r) => ({
        commodityId: r.commodity_id,
        price: Number(r.price),
        currency: r.currency,
        unit: r.unit,
        source: r.source,
        asOf: new Date(r.as_of),
      }));
      const response: ListPricesResponse = { prices };
      return callback(null, response);
    } catch (err) {
      logger.error({ err }, 'listPrices failed');
      return callback(err as Error, null as any);
    }
  },
  getLatestPrice: async (call, callback) => {
    const req: GetLatestPriceRequest = call.request;
    if (!req.commodityId) return callback(new Error('commodity_id required'), null as any);
    try {
      const res = await pool.query(
        `
        SELECT commodity_id, price, currency, unit, COALESCE(source, 'unknown') as source, as_of
        FROM market_prices
        WHERE commodity_id = $1
        ORDER BY as_of DESC
        LIMIT 1
      `,
        [req.commodityId]
      );
      const row = res.rows[0];
      const response: GetLatestPriceResponse = {
        price: row
          ? {
              commodityId: row.commodity_id,
              price: Number(row.price),
              currency: row.currency,
              unit: row.unit,
              source: row.source,
              asOf: new Date(row.as_of),
            }
          : undefined,
      };
      return callback(null, response);
    } catch (err) {
      logger.error({ err }, 'getLatestPrice failed');
      return callback(err as Error, null as any);
    }
  },
};

let server: Server | null = null;
let interval: NodeJS.Timeout | null = null;

export async function start() {
  await pool.query('SELECT 1'); // fail fast if DB not reachable
  await syncAll(DEFAULT_LOOKBACK_DAYS);
  interval = setInterval(() => {
    syncAll(7).catch((err) => logger.error({ err }, 'interval sync failed'));
  }, DEFAULT_INTERVAL_MS);

  server = new Server();
  server.addService(MarketDataServiceService, serviceImpl);
  await new Promise<void>((resolve, reject) => {
    server!.bindAsync(`0.0.0.0:${PORT}`, ServerCredentials.createInsecure(), (err) => {
      if (err) return reject(err);
      server!.start();
      resolve();
    });
  });
  logger.info({ port: PORT }, 'commodity-scraper started');
}

export async function stop() {
  if (interval) clearInterval(interval);
  if (server) {
    await new Promise<void>((resolve) => server!.tryShutdown(() => resolve()));
    server = null;
  }
  await pool.end();
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    logger.error({ err }, 'failed to start commodity-scraper');
    process.exit(1);
  });
}
