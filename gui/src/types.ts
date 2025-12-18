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
  quality?: 'value' | 'overpay' | 'fair'
  qualityColor?: string
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
  ticker?: string
  provider?: string
  providerId?: string
  emoji?: string
  totalOrders: number
  totalUnits: number
  totalCost: number
  unit: string
  currency: string
  minPrice: number
  maxPrice: number
  avgPrice: number
}

export type CommodityRegistryItem = {
  id: string
  name: string
  displayName: string
  unit: string
  ticker: string
  providerId: string
  providerName: string
  emoji: string
}

export type CompanyCommodity = {
  commodityId: string
  commodityName: string
  unit: string
}
