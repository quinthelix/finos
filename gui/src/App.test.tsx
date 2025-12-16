import { describe, expect, it } from 'vitest'
import { filterByDuration, groupCommodities } from './App'
import type { PurchaseOrder } from './types'

const sampleOrders: PurchaseOrder[] = [
  {
    id: '1',
    companyId: 'c1',
    commodityId: 'sugar',
    commodityName: 'Sugar',
    quantity: 10,
    unit: 'lb',
    pricePerUnit: 1,
    currency: 'USD',
    deliveryDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: 'confirmed',
  },
  {
    id: '2',
    companyId: 'c1',
    commodityId: 'flour',
    commodityName: 'Flour',
    quantity: 5,
    unit: 'lb',
    pricePerUnit: 2,
    currency: 'USD',
    deliveryDate: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: 'confirmed',
  },
  {
    id: '3',
    companyId: 'c1',
    commodityId: 'sugar',
    commodityName: 'Sugar',
    quantity: 7,
    unit: 'lb',
    pricePerUnit: 1.2,
    currency: 'USD',
    deliveryDate: new Date().toISOString(),
    createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'confirmed',
  },
]

describe('groupCommodities', () => {
  it('groups by commodity id and counts orders', () => {
    const grouped = groupCommodities(sampleOrders)
    expect(grouped.length).toBe(2)
    const sugar = grouped.find((g) => g.id === 'sugar')!
    expect(sugar.totalOrders).toBe(2)
  })
})

describe('filterByDuration', () => {
  it('filters by recent days', () => {
    const recent = filterByDuration(sampleOrders, 90)
    expect(recent.some((o) => o.id === '3')).toBe(false)
    expect(recent.some((o) => o.id === '1')).toBe(true)
  })
})
