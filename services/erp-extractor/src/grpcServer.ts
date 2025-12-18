import { Server, ServerCredentials, ServerUnaryCall, sendUnaryData } from '@grpc/grpc-js';
import { Pool } from 'pg';
import {
  ErpExtractorServiceService,
  ErpExtractorServiceServer,
  ListPurchaseOrdersRequest,
  ListPurchaseOrdersResponse,
  GetPurchaseOrderRequest,
  PurchaseOrder,
  PurchaseStatus,
  InventorySnapshot,
  ListInventorySnapshotsRequest,
  ListInventorySnapshotsResponse,
  ListCurrentInventoryRequest,
  ListCurrentInventoryResponse,
  ListCompanyCommoditiesRequest,
  ListCompanyCommoditiesResponse,
} from './generated/erp_extractor.js';

type GrpcServerHandle = {
  server: Server;
  address: string;
};

function toPurchaseStatus(status: any): PurchaseStatus {
  const value = typeof status === 'string' ? status.toLowerCase() : '';
  switch (value) {
    case 'in_approval':
      return PurchaseStatus.IN_APPROVAL;
    case 'executed':
      return PurchaseStatus.EXECUTED;
    case 'supplied':
      return PurchaseStatus.SUPPLIED;
    default:
      return PurchaseStatus.PURCHASE_STATUS_UNSPECIFIED;
  }
}

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
    status: toPurchaseStatus(row.status),
  };
}

function mapRowToInventorySnapshot(row: any): InventorySnapshot {
  const asOf = row.as_of instanceof Date ? row.as_of : new Date(row.as_of);
  return {
    id: row.id ?? `${row.commodity_id}_${asOf.toISOString()}`,
    companyId: row.company_id,
    commodityId: row.commodity_id,
    commodityName: row.commodity_name ?? row.commodity_id,
    onHand: Number(row.on_hand),
    unit: row.unit,
    asOf,
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

    listInventorySnapshots: async (
      call: ServerUnaryCall<ListInventorySnapshotsRequest, ListInventorySnapshotsResponse>,
      callback: sendUnaryData<ListInventorySnapshotsResponse>
    ) => {
      try {
        const companyId = call.request.companyId;
        const limit = call.request.limit && call.request.limit > 0 ? call.request.limit : 500;
        const since = call.request.since ? new Date(Number(call.request.since.seconds) * 1000) : null;

        const params: Array<string | number | Date> = [companyId];
        let where = 's.company_id = $1';
        if (since) {
          params.push(since);
          where += ` AND s.as_of > $${params.length}`;
        }
        params.push(limit);

        const res = await pool.query(
          `
          SELECT
            concat(s.commodity_id, '_', extract(epoch from s.as_of)) as id,
            s.company_id,
            s.commodity_id,
            c.name as commodity_name,
            s.on_hand,
            s.unit,
            s.as_of
          FROM erp_inventory_snapshots s
          JOIN commodities c ON c.id = s.commodity_id
          WHERE ${where}
          ORDER BY s.as_of DESC
          LIMIT $${params.length}
          `,
          params
        );

        const snapshots = res.rows.map(mapRowToInventorySnapshot);
        callback(null, { snapshots });
      } catch (err: any) {
        callback(err, null);
      }
    },

    listCurrentInventory: async (
      call: ServerUnaryCall<ListCurrentInventoryRequest, ListCurrentInventoryResponse>,
      callback: sendUnaryData<ListCurrentInventoryResponse>
    ) => {
      try {
        const companyId = call.request.companyId;
        const res = await pool.query(
          `
          SELECT DISTINCT ON (s.commodity_id)
            concat(s.commodity_id, '_', extract(epoch from s.as_of)) as id,
            s.company_id,
            s.commodity_id,
            c.name as commodity_name,
            s.on_hand,
            s.unit,
            s.as_of
          FROM erp_inventory_snapshots s
          JOIN commodities c ON c.id = s.commodity_id
          WHERE s.company_id = $1
          ORDER BY s.commodity_id, s.as_of DESC
          `,
          [companyId]
        );

        const snapshots = res.rows.map(mapRowToInventorySnapshot);
        callback(null, { snapshots });
      } catch (err: any) {
        callback(err, null);
      }
    },

    listCompanyCommodities: async (
      call: ServerUnaryCall<ListCompanyCommoditiesRequest, ListCompanyCommoditiesResponse>,
      callback: sendUnaryData<ListCompanyCommoditiesResponse>
    ) => {
      try {
        const companyId = call.request.companyId;
        const res = await pool.query(
          `
          WITH used AS (
            SELECT DISTINCT commodity_id
            FROM erp_purchase_orders
            WHERE company_id = $1
            UNION
            SELECT DISTINCT commodity_id
            FROM erp_inventory_snapshots
            WHERE company_id = $1
          ),
          named AS (
            SELECT
              u.commodity_id,
              COALESCE(
                MAX(c.display_name),
                MAX(c.name),
                u.commodity_id
              ) AS commodity_name,
              COALESCE(MAX(po.unit), MAX(s.unit), MAX(c.unit), '') AS unit
            FROM used u
            LEFT JOIN erp_purchase_orders po
              ON po.company_id = $1 AND po.commodity_id = u.commodity_id
            LEFT JOIN erp_inventory_snapshots s
              ON s.company_id = $1 AND s.commodity_id = u.commodity_id
            LEFT JOIN commodities c
              ON c.id = u.commodity_id
            GROUP BY u.commodity_id
          )
          SELECT commodity_id, commodity_name, unit
          FROM named
          ORDER BY commodity_id
          `,
          [companyId]
        );

        callback(null, {
          commodities: res.rows.map((r: any) => ({
            commodityId: r.commodity_id,
            commodityName: r.commodity_name ?? r.commodity_id,
            unit: r.unit ?? '',
          })),
        });
      } catch (err: any) {
        callback(err, null);
      }
    },
  };

  server.addService(ErpExtractorServiceService, serviceImpl);

  const bindAddress = `${host}:${port}`;
  await new Promise<void>((resolve, reject) => {
    server.bindAsync(bindAddress, ServerCredentials.createInsecure(), (err: Error | null) => {
      if (err) return reject(err);
      server.start();
      resolve();
    });
  });

  return { server, address: bindAddress };
}
