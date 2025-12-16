import { Server, ServerCredentials, ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import { Pool } from 'pg';
import {
  ErpExtractorServiceService,
  ErpExtractorServiceServer,
  ListPurchaseOrdersRequest,
  ListPurchaseOrdersResponse,
  GetPurchaseOrderRequest,
  PurchaseOrder,
} from './generated/erp_extractor.js';

type GrpcServerHandle = {
  server: Server;
  address: string;
};

function mapRowToPurchaseOrder(row: any): PurchaseOrder {
  const delivery =
    row.delivery_date instanceof Date ? row.delivery_date : new Date(row.delivery_date);
  const created = row.created_at instanceof Date ? row.created_at : new Date(row.created_at);

  return {
    id: row.id,
    companyId: row.company_id,
    commodityId: row.commodity_id,
    commodityName: row.commodity_name ?? row.commodity_id,
    quantity: Number(row.quantity),
    unit: row.unit,
    pricePerUnit: Number(row.price_per_unit),
    currency: row.currency,
    deliveryDate: delivery,
    createdAt: created,
    status: row.status,
  };
}

export async function startGrpcServer(pool: Pool, host: string, port: number): Promise<GrpcServerHandle> {
  const server = new Server();

  const serviceImpl: ErpExtractorServiceServer = {
    listPurchaseOrders: async (
      call: ServerUnaryCall<ListPurchaseOrdersRequest, ListPurchaseOrdersResponse>,
      callback: sendUnaryData<ListPurchaseOrdersResponse>
    ) => {
      try {
        const companyId = call.request.companyId;
        // Higher default so consumers (api-gateway/gui) see enough history without
        // having to always set a limit; still bounded by caller-supplied limit.
        const limit = call.request.limit && call.request.limit > 0 ? call.request.limit : 500;
        const since = call.request.since ? new Date(Number(call.request.since.seconds) * 1000) : null;

        const params: Array<string | number | Date> = [companyId];
        let where = 'company_id = $1';
        if (since) {
          params.push(since);
          where += ` AND created_at > $${params.length}`;
        }
        params.push(limit);

        const res = await pool.query(
          `SELECT id, company_id, commodity_id, quantity, unit, price_per_unit, currency, delivery_date, created_at, status
           FROM erp_purchase_orders
           WHERE ${where}
           ORDER BY created_at DESC
           LIMIT $${params.length}`,
          params
        );
        const purchaseOrders = res.rows.map(mapRowToPurchaseOrder);
        callback(null, { purchaseOrders });
      } catch (err: any) {
        callback(err, null);
      }
    },

    getPurchaseOrder: async (
      call: ServerUnaryCall<GetPurchaseOrderRequest, PurchaseOrder>,
      callback: sendUnaryData<PurchaseOrder>
    ) => {
      try {
        const { companyId, id } = call.request;
        const res = await pool.query(
          `SELECT id, company_id, commodity_id, quantity, unit, price_per_unit, currency, delivery_date, created_at, status
           FROM erp_purchase_orders
           WHERE company_id = $1 AND id = $2
           LIMIT 1`,
          [companyId, id]
        );
        if (res.rowCount === 0) {
          const error: any = new Error('not found');
          error.code = 5; // NOT_FOUND
          callback(error, null);
          return;
        }
        callback(null, mapRowToPurchaseOrder(res.rows[0]));
      } catch (err: any) {
        callback(err, null);
      }
    },
  };

  server.addService(ErpExtractorServiceService, serviceImpl);

  const bindAddress = `${host}:${port}`;
  await new Promise<void>((resolve, reject) => {
    server.bindAsync(bindAddress, ServerCredentials.createInsecure(), (err) => {
      if (err) return reject(err);
      server.start();
      resolve();
    });
  });

  return { server, address: bindAddress };
}
