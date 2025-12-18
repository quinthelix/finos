import Fastify from 'fastify';
import pino from 'pino';
import { credentials } from '@grpc/grpc-js';
import {
  ErpExtractorServiceClient,
  ListPurchaseOrdersRequest,
  PurchaseOrder,
  ListCurrentInventoryRequest,
  ListInventorySnapshotsRequest,
  InventorySnapshot,
} from './generated/erp_extractor.js';
import {
  MarketDataServiceClient,
  ListPricesRequest,
  PricePoint,
} from './generated/market_data.js';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const app = Fastify({ logger });

let erpClient: ErpExtractorServiceClient | null = null;
let marketClient: MarketDataServiceClient | null = null;
let defaultCompanyId = '00000000-0000-0000-0000-000000000001';

function loadConfig() {
  // Allow multiple CORS origins for both Docker (4173) and local dev (5173)
  const defaultOrigins = 'http://localhost:5173,http://localhost:4173,http://127.0.0.1:5173,http://127.0.0.1:4173';
  return {
    port: Number(process.env.PORT || 8080),
    extractorAddr: process.env.ERP_EXTRACTOR_GRPC_ADDR || 'localhost:50051',
    marketAddr: process.env.MARKET_DATA_GRPC_ADDR || 'localhost:50060',
    companyId: process.env.COMPANY_ID || '00000000-0000-0000-0000-000000000001',
    corsOrigins: (process.env.CORS_ORIGIN || defaultOrigins).split(',').map(s => s.trim()),
  };
}

app.get('/health', async () => ({ status: 'ok' }));

app.get('/api/company/:companyId/purchase-orders', async (request, reply) => {
  const { companyId } = request.params as { companyId: string };
  const limitRaw = (request.query as { limit?: string }).limit;
  const parsed = limitRaw ? parseInt(limitRaw, 10) : NaN;
  // Default higher so the GUI has enough history; clamp to keep it safe.
  const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 2000)) : 500;
  const req: ListPurchaseOrdersRequest = {
    companyId: companyId || defaultCompanyId,
    limit,
  };

  const client = erpClient;
  if (!client) throw new Error('ERP client not initialized');

  const res = await new Promise<{ purchaseOrders: PurchaseOrder[] }>((resolve, reject) => {
    client.listPurchaseOrders(req, (err, response) => {
      if (err || !response) return reject(err || new Error('no response'));
      resolve(response);
    });
  });

  const data = res.purchaseOrders.map((po) => ({
    id: po.id,
    companyId: po.companyId,
    commodityId: po.commodityId,
    commodityName: po.commodityName,
    quantity: po.quantity,
    unit: po.unit,
    pricePerUnit: po.pricePerUnit,
    currency: po.currency,
    deliveryDate: po.deliveryDate?.toISOString(),
    createdAt: po.createdAt?.toISOString(),
    status: po.status,
  }));

  return reply.send({ data });
});

app.get('/api/company/:companyId/inventory', async (request, reply) => {
  const { companyId } = request.params as { companyId: string };

  const req: ListCurrentInventoryRequest = {
    companyId: companyId || defaultCompanyId,
  };

  const client = erpClient;
  if (!client) throw new Error('ERP client not initialized');

  const res = await new Promise<{ snapshots: InventorySnapshot[] }>((resolve, reject) => {
    client.listCurrentInventory(req, (err, response) => {
      if (err || !response) return reject(err || new Error('no response'));
      resolve(response);
    });
  });

  const data = res.snapshots.map((s) => ({
    id: s.id,
    companyId: s.companyId,
    commodityId: s.commodityId,
    commodityName: s.commodityName,
    onHand: s.onHand,
    unit: s.unit,
    asOf: s.asOf?.toISOString(),
  }));

  return reply.send({ data });
});

app.get('/api/company/:companyId/inventory-snapshots', async (request, reply) => {
  const { companyId } = request.params as { companyId: string };
  const { limit, since } = request.query as { limit?: string; since?: string };

  const parsedLimit = limit ? parseInt(limit, 10) : NaN;
  const effectiveLimit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 5000)) : 2000;
  const sinceDate = since ? new Date(since) : undefined;

  const req: ListInventorySnapshotsRequest = {
    companyId: companyId || defaultCompanyId,
    limit: effectiveLimit,
    since: sinceDate && !Number.isNaN(sinceDate.getTime()) ? sinceDate : undefined,
  };

  const client = erpClient;
  if (!client) throw new Error('ERP client not initialized');

  const res = await new Promise<{ snapshots: InventorySnapshot[] }>((resolve, reject) => {
    client.listInventorySnapshots(req, (err, response) => {
      if (err || !response) return reject(err || new Error('no response'));
      resolve(response);
    });
  });

  const data = res.snapshots.map((s) => ({
    id: s.id,
    companyId: s.companyId,
    commodityId: s.commodityId,
    commodityName: s.commodityName,
    onHand: s.onHand,
    unit: s.unit,
    asOf: s.asOf?.toISOString(),
  }));

  return reply.send({ data });
});

app.get('/api/commodities/:commodityId/prices', async (request, reply) => {
  const { commodityId } = request.params as { commodityId: string };
  const { start, end, limit } = request.query as { start?: string; end?: string; limit?: string };
  const parsedLimit = limit ? parseInt(limit, 10) : NaN;
  const effectiveLimit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 2000)) : 500;
  const startDate = start ? new Date(start) : undefined;
  const endDate = end ? new Date(end) : undefined;

  const req: ListPricesRequest = {
    commodityId,
    start: startDate && !Number.isNaN(startDate.getTime()) ? startDate : undefined,
    end: endDate && !Number.isNaN(endDate.getTime()) ? endDate : undefined,
    limit: effectiveLimit,
  };

  const client = marketClient;
  if (!client) throw new Error('Market client not initialized');

  const res = await new Promise<{ prices: PricePoint[] }>((resolve, reject) => {
    client.listPrices(req, (err, response) => {
      if (err || !response) return reject(err || new Error('no response'));
      resolve(response);
    });
  });

  const data = res.prices.map((p) => ({
    commodityId: p.commodityId,
    price: p.price,
    currency: p.currency,
    unit: p.unit,
    source: p.source,
    asOf: p.asOf?.toISOString(),
  }));

  return reply.send({ data });
});

export async function start() {
  const cfg = loadConfig();
  defaultCompanyId = cfg.companyId;
  
  // Dynamic CORS - check if request origin is in allowed list
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin || '';
    const allowedOrigin = cfg.corsOrigins.includes(origin) ? origin : cfg.corsOrigins[0];
    
    reply.header('Access-Control-Allow-Origin', allowedOrigin);
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      reply.code(204).send();
    }
  });
  
  erpClient = new ErpExtractorServiceClient(cfg.extractorAddr, credentials.createInsecure());
  marketClient = new MarketDataServiceClient(cfg.marketAddr, credentials.createInsecure());
  await app.listen({ port: cfg.port, host: '0.0.0.0' });
  logger.info({ port: cfg.port, extractor: cfg.extractorAddr, market: cfg.marketAddr, cors: cfg.corsOrigins }, 'api-gateway started');
}

export async function stop() {
  await app.close();
}

if (process.env.NODE_ENV !== 'test') {
  start().catch((err) => {
    logger.error({ err }, 'failed to start api-gateway');
    process.exit(1);
  });
}
