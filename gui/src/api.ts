import log from 'loglevel'
import type { PurchaseOrder, InventoryItem } from './types'

const API_URL = import.meta.env.VITE_API_GATEWAY_URL || 'http://localhost:8080'
const COMPANY_ID = import.meta.env.VITE_COMPANY_ID || '00000000-0000-0000-0000-000000000001'

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  // Pull a larger window so the commodities chart has enough history.
  // The backend still enforces its own cap.
  const url = `${API_URL}/api/company/${COMPANY_ID}/purchase-orders?limit=500`
  const res = await fetch(url)
  if (!res.ok) {
    log.error('Failed to fetch purchase orders', res.status)
    throw new Error(`fetch failed ${res.status}`)
  }
  const body = (await res.json()) as { data: PurchaseOrder[] }
  return body.data || []
}

export async function fetchInventory(): Promise<InventoryItem[]> {
  const url = `${API_URL}/api/company/${COMPANY_ID}/inventory`
  const res = await fetch(url)
  if (!res.ok) {
    log.error('Failed to fetch inventory', res.status)
    throw new Error(`fetch failed ${res.status}`)
  }
  const body = (await res.json()) as { data: InventoryItem[] }
  return body.data || []
}

export async function fetchInventorySnapshots(): Promise<InventoryItem[]> {
  // Weekly snapshots can be large; default limit is bounded server-side too.
  const url = `${API_URL}/api/company/${COMPANY_ID}/inventory-snapshots?limit=2000`
  const res = await fetch(url)
  if (!res.ok) {
    log.error('Failed to fetch inventory snapshots', res.status)
    throw new Error(`fetch failed ${res.status}`)
  }
  const body = (await res.json()) as { data: InventoryItem[] }
  return body.data || []
}
