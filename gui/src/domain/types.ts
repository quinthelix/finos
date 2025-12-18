// Shared domain types
export type PurchaseQuality = 'value' | 'overpay' | 'fair';

export type Purchase = {
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
  status: string;
  quality?: PurchaseQuality;
  qualityColor?: string;
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

export type MarketPricePoint = {
  commodityId: string;
  price: number;
  currency: string;
  unit: string;
  source: string;
  asOf: string;
};

export type CommodityRegistryItem = {
  id: string;
  name: string;
  displayName: string;
  unit: string;
  ticker: string;
  providerId: string;
  providerName: string;
  emoji: string;
};

export type CompanyCommodity = {
  commodityId: string;
  commodityName: string;
  unit: string;
};

export type CommoditySummary = {
  id: string;
  name: string;
  totalOrders: number;
  totalUnits: number;
  totalCost: number;
  unit: string;
  currency: string;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
};
