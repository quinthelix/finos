import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import Fastify from 'fastify';
import { Server, ServerCredentials } from '@grpc/grpc-js';
import { start, stop } from './index.js';
import {
  ErpExtractorServiceService,
  ListPurchaseOrdersRequest,
  ListPurchaseOrdersResponse,
  PurchaseOrder,
  PurchaseStatus,
} from './generated/erp_extractor.js';
import pino from 'pino';

describe('api-gateway purchase orders route', () => {
  let grpcServer: Server;
  let fastify: ReturnType<typeof Fastify>;
  const logger = pino({ level: 'silent' });

  const samplePO: PurchaseOrder = {
    id: 'po-123',
    companyId: 'comp-1',
    commodityId: 'sugar',
    commodityName: 'Sugar',
    quantity: 10,
    unit: 'lb',
    pricePerUnit: 1.23,
    currency: 'USD',
    deliveryDate: new Date(),
    createdAt: new Date(),
    status: PurchaseStatus.EXECUTED,
  };

  beforeAll(async () => {
    jest.setTimeout(10000);
    grpcServer = new Server();
    grpcServer.addService(ErpExtractorServiceService, {
      listPurchaseOrders: (call, cb) => {
        const _req = call.request as ListPurchaseOrdersRequest;
        const res: ListPurchaseOrdersResponse = { purchaseOrders: [samplePO] };
        cb(null, res);
      },
      getPurchaseOrder: (_call, cb) => cb(null, samplePO),
    });
    await new Promise<void>((resolve, reject) => {
      grpcServer.bindAsync('127.0.0.1:50099', ServerCredentials.createInsecure(), (err) => {
        if (err) return reject(err);
        grpcServer.start();
        resolve();
      });
    });

    process.env.ERP_EXTRACTOR_GRPC_ADDR = '127.0.0.1:50099';
    process.env.PORT = '8099';
    process.env.NODE_ENV = 'test';
    // start gateway
    await start();
  });

  afterAll(async () => {
    if (grpcServer) grpcServer.forceShutdown();
    await stop();
  });

  it('returns purchase orders from gRPC backend', async () => {
    const res = await fetch('http://127.0.0.1:8099/api/company/comp-1/purchase-orders');
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { data: any[] };
    expect(body.data[0].id).toBe('po-123');
    expect(body.data[0].commodityId).toBe('sugar');
    expect(body.data[0].status).toBe('executed');
  });
});
