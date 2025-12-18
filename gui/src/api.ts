import type { Purchase, InventorySnapshot, MarketPricePoint } from './domain/types';

const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080';
const COMPANY_ID = import.meta.env.VITE_COMPANY_ID || '00000000-0000-0000-0000-000000000001';

export async function fetchPurchaseOrders(): Promise<Purchase[]> {
  const url = `${API_URL}/api/company/${COMPANY_ID}/purchase-orders?limit=500`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status}`);
  }
  const body = (await res.json()) as { data: Purchase[] };
  return body.data || [];
}

export async function fetchInventory(): Promise<InventorySnapshot[]> {
  const url = `${API_URL}/api/company/${COMPANY_ID}/inventory`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status}`);
  }
  const body = (await res.json()) as { data: InventorySnapshot[] };
  return body.data || [];
}

export async function fetchInventorySnapshots(): Promise<InventorySnapshot[]> {
  const url = `${API_URL}/api/company/${COMPANY_ID}/inventory-snapshots?limit=2000`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status}`);
  }
  const body = (await res.json()) as { data: InventorySnapshot[] };
  return body.data || [];
}

export async function fetchMarketPrices(params: {
  commodityId: string;
  start?: string;
  end?: string;
  limit?: number;
}): Promise<MarketPricePoint[]> {
  const search = new URLSearchParams();
  if (params.start) search.set('start', params.start);
  if (params.end) search.set('end', params.end);
  if (params.limit) search.set('limit', String(params.limit));
  const url = `${API_URL}/api/commodities/${params.commodityId}/prices${search.toString() ? `?${search}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch failed ${res.status}`);
  }
  const body = (await res.json()) as { data: MarketPricePoint[] };
  return body.data || [];
}
