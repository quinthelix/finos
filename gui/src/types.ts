export type PurchaseOrder = {
  id: string
  companyId: string
  commodityId: string
  commodityName: string
  quantity: number
  unit: string
  pricePerUnit: number
  currency: string
  deliveryDate: string
  createdAt: string
  status: string
}

export type InventoryItem = {
  id: string
  companyId: string
  commodityId: string
  commodityName: string
  onHand: number
  unit: string
  asOf: string
}

export type CommoditySummary = {
  id: string
  name: string
  totalOrders: number
  totalUnits: number
  totalCost: number
  unit: string
  currency: string
  minPrice: number
  maxPrice: number
  avgPrice: number
}
