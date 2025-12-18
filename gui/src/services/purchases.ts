import type { InventorySnapshot, Purchase, CommoditySummary } from '../domain/types';
import { qualityStroke, buildCommodityColorMap } from '../domain/colors';

export function groupCommodities(purchaseOrders: Purchase[]): CommoditySummary[] {
  const map = new Map<
    string,
    {
      id: string;
      name: string;
      orders: number;
      totalUnits: number;
      totalCost: number;
      unit: string;
      currency: string;
      prices: number[];
    }
  >();

  purchaseOrders.forEach((po) => {
    if (!map.has(po.commodityId)) {
      map.set(po.commodityId, {
        id: po.commodityId,
        name: po.commodityName || po.commodityId,
        orders: 0,
        totalUnits: 0,
        totalCost: 0,
        unit: po.unit,
        currency: po.currency,
        prices: [],
      });
    }
    const entry = map.get(po.commodityId)!;
    entry.orders += 1;
    entry.totalUnits += po.quantity;
    entry.totalCost += po.pricePerUnit * po.quantity;
    entry.prices.push(po.pricePerUnit);
  });

  return Array.from(map.values())
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      totalOrders: entry.orders,
      totalUnits: entry.totalUnits,
      totalCost: entry.totalCost,
      unit: entry.unit,
      currency: entry.currency,
      minPrice: entry.prices.length > 0 ? Math.min(...entry.prices) : 0,
      maxPrice: entry.prices.length > 0 ? Math.max(...entry.prices) : 0,
      avgPrice:
        entry.prices.length > 0
          ? entry.prices.reduce((a, b) => a + b, 0) / entry.prices.length
          : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost);
}

export function tagQuality(orders: Purchase[]): Purchase[] {
  const medians = new Map<string, number>();
  const pricesByCommodity = new Map<string, number[]>();
  orders.forEach((po) => {
    const arr = pricesByCommodity.get(po.commodityId) ?? [];
    arr.push(po.pricePerUnit);
    pricesByCommodity.set(po.commodityId, arr);
  });
  pricesByCommodity.forEach((prices, key) => {
    const sorted = prices.slice().sort((a, b) => a - b);
    if (!sorted.length) return;
    const mid = Math.floor(sorted.length / 2);
    const median =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    medians.set(key, median);
  });

  return orders.map((o) => {
    const median = medians.get(o.commodityId);
    if (median === undefined) return o;
    let quality: Purchase['quality'];
    let qualityColor: string | undefined;
    if (o.pricePerUnit >= median * 1.1) {
      quality = 'overpay';
      qualityColor = qualityStroke.overpay;
    } else if (o.pricePerUnit <= median * 0.9) {
      quality = 'value';
      qualityColor = qualityStroke.value;
    } else {
      quality = 'fair';
      qualityColor = qualityStroke.fair;
    }
    return { ...o, quality, qualityColor };
  });
}

export function latestInventoryMap(inventory: InventorySnapshot[]): Map<string, InventorySnapshot> {
  const map = new Map<string, InventorySnapshot>();
  inventory.forEach((i) => map.set(i.commodityId, i));
  return map;
}

export function buildColorsForCommodities(commodities: CommoditySummary[]): Map<string, string> {
  return buildCommodityColorMap(commodities.map((c) => c.id));
}
