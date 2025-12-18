import { useCallback, useEffect, useMemo, useState } from 'react'
import './index.css'
import log from 'loglevel'
import {
  fetchCommodityRegistry,
  fetchCompanyCommodities,
  fetchInventory,
  fetchInventorySnapshots,
  fetchMarketPrices,
  fetchPurchaseOrders,
} from './api'
import type { InventoryItem, PurchaseOrder, CommoditySummary } from './types'
import { LineChart } from './components/LineChart'
import type { Point, Series } from './components/LineChart'
import { SplitChart } from './components/SplitChart'
import { buildCommodityColorMap } from './domain/colors'

type NavId = 'commodities' | 'positions' | 'trade'

const NAV_ITEMS: { id: NavId; label: string; icon: string }[] = [
  { id: 'commodities', label: 'Commodities', icon: 'chart' },
  { id: 'positions', label: 'Positions', icon: 'layers' },
  { id: 'trade', label: 'Trade', icon: 'zap' },
]

const DURATIONS = [
  { id: '30', label: '1M', days: 30 },
  { id: '90', label: '3M', days: 90 },
  { id: '180', label: '6M', days: 180 },
  { id: '365', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: 0 },
]

// Commodity metadata (names/ticker/provider/emoji) must be discovered from the DB via API.

// Finos Logo - Yin-Yang style with f, i, n, o, s
function FinosLogo() {
  return (
    <svg 
      width="36" 
      height="36" 
      viewBox="0 0 100 100" 
      className="finos-logo"
    >
      {/* Outer circle (O) */}
      <circle 
        cx="50" 
        cy="50" 
        r="46" 
        fill="none" 
        stroke="url(#logoGradient)" 
        strokeWidth="4"
      />
      
      {/* S-curve divider (like yin-yang) */}
      <path
        d="M 50 4 
           C 50 4, 75 25, 50 50 
           C 25 75, 50 96, 50 96"
        fill="none"
        stroke="url(#logoGradient)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      
      {/* Left side - "f" */}
      <text
        x="28"
        y="58"
        fontSize="28"
        fontWeight="700"
        fontFamily="var(--font-sans)"
        fill="#00d4aa"
      >
        f
      </text>
      
      {/* Right side - "n" */}
      <text
        x="58"
        y="58"
        fontSize="28"
        fontWeight="700"
        fontFamily="var(--font-sans)"
        fill="#3b82f6"
      >
        n
      </text>
      
      {/* "i" as dots breaking the S - top dot */}
      <circle cx="50" cy="27" r="4" fill="#00d4aa" />
      
      {/* "i" line segment on S */}
      <line
        x1="50"
        y1="35"
        x2="50"
        y2="45"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
      
      {/* "i" as dots breaking the S - bottom dot */}
      <circle cx="50" cy="73" r="4" fill="#3b82f6" />
      
      {/* Gradient definition */}
      <defs>
        <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00d4aa" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function NavIcon({ type }: { type: string }) {
  switch (type) {
    case 'chart':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3v18h18" />
          <path d="M18 9l-5 5-4-4-3 3" />
        </svg>
      )
    case 'layers':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      )
    case 'zap':
      return (
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      )
    default:
      return null
  }
}

function formatPurchaseStatus(raw: unknown): { label: string; className: 'pending' | 'executed' | 'supplied' } {
  // API currently returns numeric enums from proto:
  // 0 unspecified, 1 in_approval, 2 executed, 3 supplied.
  if (typeof raw === 'number') {
    if (raw === 2) return { label: 'Executed', className: 'executed' }
    if (raw === 3) return { label: 'Supplied', className: 'supplied' }
    return { label: 'Pending', className: 'pending' }
  }

  const s = String(raw ?? '').trim().toLowerCase()
  if (s === '2' || s === 'executed') return { label: 'Executed', className: 'executed' }
  if (s === '3' || s === 'supplied') return { label: 'Supplied', className: 'supplied' }
  return { label: 'Pending', className: 'pending' }
}

function groupCommodities(purchaseOrders: PurchaseOrder[]): CommoditySummary[] {
  const map = new Map<string, {
    id: string
    name: string
    orders: number
    totalUnits: number
    totalCost: number
    unit: string
    currency: string
    prices: number[]
  }>()

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
      })
    }
    const entry = map.get(po.commodityId)!
    entry.orders += 1
    entry.totalUnits += po.quantity
    entry.totalCost += po.pricePerUnit * po.quantity
    entry.prices.push(po.pricePerUnit)
  })

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
      avgPrice: entry.prices.length > 0 ? entry.prices.reduce((a, b) => a + b, 0) / entry.prices.length : 0,
    }))
    .sort((a, b) => b.totalCost - a.totalCost)
}

function filterByDuration(orders: PurchaseOrder[], days: number): PurchaseOrder[] {
  if (days === 0) return orders
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  return orders.filter((po) => new Date(po.createdAt).getTime() >= cutoff)
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toFixed(0)
}

function weekKey(d: Date): string {
  // ISO-ish week start: Monday 00:00 UTC
  const day = d.getUTCDay() // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7 // 0 for Mon, 6 for Sun
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
  start.setUTCDate(start.getUTCDate() - diff)
  return start.toISOString().slice(0, 10)
}

function hexToRgba(hex: string, alpha: number): string {
  // Supports #RRGGBB
  const cleaned = hex.replace('#', '')
  if (cleaned.length !== 6) return `rgba(255,255,255,${alpha})`
  const r = parseInt(cleaned.slice(0, 2), 16)
  const g = parseInt(cleaned.slice(2, 4), 16)
  const b = parseInt(cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function UnderConstruction({ feature }: { feature: string }) {
  return (
    <div className="under-construction">
      <div className="construction-icon">
        {feature === 'positions' ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        ) : (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        )}
      </div>
      <h2 className="construction-title">
        {feature === 'positions' ? 'Positions' : 'Trading'} Coming Soon
      </h2>
      <p className="construction-subtitle">
        {feature === 'positions'
          ? 'Track your hedging positions, view P&L, and monitor your portfolio exposure across all commodities.'
          : 'Execute trades, manage orders, and access real-time market data with our integrated trading platform.'}
      </p>
    </div>
  )
}

function CommoditiesView({
  orders,
  inventory,
  inventorySnapshots,
  commodityRegistry,
  companyCommodities,
  loading,
  error,
}: {
  orders: PurchaseOrder[]
  inventory: InventoryItem[]
  inventorySnapshots: InventoryItem[]
  commodityRegistry: Array<{
    id: string
    name: string
    displayName: string
    unit: string
    ticker: string
    providerId: string
    providerName: string
    emoji: string
  }>
  companyCommodities: Array<{ commodityId: string; commodityName: string; unit: string }>
  loading: boolean
  error: string | null
}) {
  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null)
  const [overlayMode, setOverlayMode] = useState(false)
  const [overlaySelection, setOverlaySelection] = useState<Set<string>>(new Set())
  const [duration, setDuration] = useState<string>('all')
  const [pinnedX, setPinnedX] = useState<Date | null>(null)
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [marketPrices, setMarketPrices] = useState<
    { commodityId: string; price: number; currency: string; unit: string; source: string; asOf: string }[]
  >([])

  const registryById = useMemo(() => {
    const m = new Map<string, (typeof commodityRegistry)[number]>()
    for (const c of commodityRegistry) {
      if (c?.id) m.set(String(c.id).toLowerCase(), c)
    }
    return m
  }, [commodityRegistry])

  const companyCommodityIds = useMemo(() => {
    return (companyCommodities || []).map((c) => String(c.commodityId)).filter(Boolean)
  }, [companyCommodities])

  const getCommodityEmoji = useCallback(
    (commodityId: string): string => {
      const c = registryById.get(commodityId.toLowerCase())
      return c?.emoji || '📦'
    },
    [registryById]
  )

  // Filter ALL orders by duration first
  const filteredOrders = useMemo(() => {
    const durationDays = DURATIONS.find((d) => d.id === duration)?.days ?? 0
    return filterByDuration(orders, durationDays)
  }, [orders, duration])

  // Fetch market prices for the selected commodity (single mode) so the unit price chart is real scraper data.
  useEffect(() => {
    let cancelled = false
    async function loadPrices() {
      if (overlayMode) return
      if (!selectedCommodity) return

      const durationDays = DURATIONS.find((d) => d.id === duration)?.days ?? 0
      const end = new Date()
      const start = durationDays ? new Date(end.getTime() - durationDays * 24 * 60 * 60 * 1000) : undefined

      try {
        const data = await fetchMarketPrices({
          commodityId: selectedCommodity,
          start: start ? start.toISOString() : undefined,
          end: end.toISOString(),
          limit: durationDays ? 2000 : 5000,
        })
        if (!cancelled) setMarketPrices(data)
      } catch (e) {
        // Non-fatal; chart can fall back to purchase prices if needed.
        if (!cancelled) setMarketPrices([])
      }
    }
    loadPrices()
    return () => {
      cancelled = true
    }
  }, [overlayMode, selectedCommodity, duration])

  // Group commodities from filtered orders
  const commodities = useMemo(() => groupCommodities(filteredOrders), [filteredOrders])

  // Latest inventory by commodity (api-gateway returns current inventory already)
  const inventoryByCommodity = useMemo(() => {
    const map = new Map<string, InventoryItem>()
    inventory.forEach((i) => map.set(i.commodityId, i))
    return map
  }, [inventory])

  // Create color map for commodities
  const commodityColors = useMemo(() => {
    return buildCommodityColorMap(commodities.map((c) => c.id))
  }, [commodities])

  // Auto-select first commodity when data loads (single mode)
  useEffect(() => {
    if (!overlayMode && commodities.length && !selectedCommodity) {
      setSelectedCommodity(commodities[0].id)
    }
    if (!overlayMode && selectedCommodity && commodities.length && !commodities.find(c => c.id === selectedCommodity)) {
      setSelectedCommodity(commodities[0].id)
    }
  }, [commodities, selectedCommodity, overlayMode])

  // Handle commodity click
  const handleCommodityClick = (commodityId: string) => {
    if (overlayMode) {
      // Toggle selection in overlay mode
      setOverlaySelection(prev => {
        const newSet = new Set(prev)
        if (newSet.has(commodityId)) {
          newSet.delete(commodityId)
        } else {
          newSet.add(commodityId)
        }
        return newSet
      })
    } else {
      // Single selection mode
      setSelectedCommodity(commodityId)
    }
  }

  // Toggle overlay mode
  const handleToggleOverlay = () => {
    if (!overlayMode) {
      // Entering overlay mode - clear selection
      setOverlaySelection(new Set())
    }
    setOverlayMode(!overlayMode)
  }

  // Orders for the selected commodity(s)
  const commodityOrders = useMemo(() => {
    if (overlayMode) {
      return filteredOrders.filter(o => overlaySelection.has(o.commodityId))
    }

    const medianOf = (values: number[]): number | undefined => {
      if (!values.length) return undefined
      const sorted = values.slice().sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    }

    const pricesSorted = marketPrices
      .map((p) => ({ t: new Date(p.asOf).getTime(), y: p.price }))
      .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.y))
      .sort((a, b) => a.t - b.t)
    const fallbackMedian = medianOf(pricesSorted.map((p) => p.y))
    const windowMs = 90 * 24 * 60 * 60 * 1000

    return filteredOrders
      .filter((o) => (selectedCommodity ? o.commodityId === selectedCommodity : true))
      .map((o) => {
        // 3-month rolling median of market price (commodity cost proxy) around purchase time.
        const t = new Date(o.createdAt).getTime()
        const winStart = t - windowMs
        const windowPrices = pricesSorted.filter((p) => p.t >= winStart && p.t <= t).map((p) => p.y)
        const median = medianOf(windowPrices) ?? fallbackMedian
        let quality: 'value' | 'overpay' | 'fair' | undefined
        let qualityColor: string | undefined
        if (median !== undefined) {
          if (o.pricePerUnit >= median * 1.1) quality = 'overpay'
          else if (o.pricePerUnit <= median * 0.9) quality = 'value'
          else quality = 'fair'
          if (quality === 'overpay') qualityColor = '#ef4444'
          if (quality === 'value') qualityColor = '#10b981'
          if (quality === 'fair') qualityColor = '#ffffff'
        }
        return { ...o, quality, qualityColor }
      })
  }, [filteredOrders, selectedCommodity, overlayMode, overlaySelection, marketPrices])

  const qualitySpend = useMemo(() => {
    const buckets = { value: 0, fair: 0, overpay: 0 }
    for (const o of commodityOrders) {
      const spent = Number(o.pricePerUnit) * Number(o.quantity)
      if (!Number.isFinite(spent) || spent <= 0) continue
      if (o.quality === 'value') buckets.value += spent
      else if (o.quality === 'overpay') buckets.overpay += spent
      else if (o.quality === 'fair') buckets.fair += spent
    }
    return buckets
  }, [commodityOrders])

  // Cost series points (non-overlay mode)
  const costPoints: Point[] = useMemo(() => {
    if (overlayMode) return []
    return commodityOrders
      .map((o) => ({ x: new Date(o.createdAt), y: o.pricePerUnit * o.quantity }))
      .sort((a, b) => a.x.getTime() - b.x.getTime())
  }, [commodityOrders, overlayMode])

  // Inventory series points (weekly snapshots, non-overlay mode)
  const inventoryPoints: Point[] = useMemo(() => {
    if (overlayMode) return []
    if (!selectedCommodity) return []
    // Filter snapshots by selected commodity and duration (same duration state as orders)
    const durationDays = DURATIONS.find((d) => d.id === duration)?.days ?? 0
    const cutoff = durationDays === 0 ? 0 : Date.now() - durationDays * 24 * 60 * 60 * 1000
    return inventorySnapshots
      .filter((s) => s.commodityId === selectedCommodity)
      .filter((s) => (durationDays === 0 ? true : new Date(s.asOf).getTime() >= cutoff))
      .map((s) => ({ x: new Date(s.asOf), y: s.onHand }))
      .sort((a, b) => a.x.getTime() - b.x.getTime())
  }, [inventorySnapshots, overlayMode, selectedCommodity, duration])

  // Multiple series for overlay mode
  const chartSeries: Series[] = useMemo(() => {
    if (!overlayMode) return []
    
    return Array.from(overlaySelection).map(commodityId => {
      const commodity = commodities.find(c => c.id === commodityId)
      const points = filteredOrders
        .filter(o => o.commodityId === commodityId)
        .map(o => ({ x: new Date(o.createdAt), y: o.pricePerUnit * o.quantity }))
        .sort((a, b) => a.x.getTime() - b.x.getTime())
      
      return {
        id: commodityId,
        name: commodity?.name || commodityId,
        points,
        color: commodityColors.get(commodityId.toLowerCase()) || '#00d4aa'
      }
    })
  }, [overlayMode, overlaySelection, filteredOrders, commodities, commodityColors])

  const singleModeSeries: Series[] = useMemo(() => {
    if (overlayMode) return []
    if (!selectedCommodity) return []
    const color = commodityColors.get(selectedCommodity.toLowerCase()) || '#00d4aa'
    const unit = inventoryByCommodity.get(selectedCommodity)?.unit
    const barQualityStroke = commodityOrders.find((o) => o.commodityId === selectedCommodity && o.qualityColor)?.qualityColor
    return [
      {
        id: `cost-${selectedCommodity}`,
        name: 'Cost',
        points: costPoints,
        color,
        yAxis: 'left',
        valueFormat: 'currency',
        type: 'bar',
        ...(barQualityStroke ? { strokeColor: barQualityStroke } : {}),
      },
      {
        id: `inv-${selectedCommodity}`,
        name: 'Inventory',
        points: inventoryPoints,
        color,
        dash: '6,6',
        yAxis: 'right',
        unit,
        valueFormat: 'number',
      },
    ]
  }, [overlayMode, selectedCommodity, commodityColors, costPoints, inventoryPoints, inventoryByCommodity, commodityOrders])

  // Unit price series from market prices (scraper). Color dots by purchase quality only when a purchase exists on that date.
  const pricePoints: Point[] = useMemo(() => {
    if (overlayMode) return []
    if (!selectedCommodity) return []

    const qualityByWeek = new Map<string, string>()
    commodityOrders.forEach((o) => {
      if (!o.qualityColor) return
      qualityByWeek.set(weekKey(new Date(o.createdAt)), o.qualityColor)
    })

    const all = marketPrices.filter((p) => p.commodityId === selectedCommodity)
    // Prefer yahoo if present; otherwise fall back to seed/other sources.
    const hasYahoo = all.some((p) => p.source === 'yahoo')
    const preferred = hasYahoo ? all.filter((p) => p.source === 'yahoo') : all

    // If we still have no market prices, fall back to purchase order unit prices so the chart isn't blank.
    const fallback = commodityOrders
      .map((o) => ({ x: new Date(o.createdAt), y: o.pricePerUnit, strokeColor: o.qualityColor }))
      .sort((a, b) => a.x.getTime() - b.x.getTime())
    if (!preferred.length) return fallback

    // Downsample to weekly (one point per week) to reduce clutter.
    const byWeek = new Map<string, { t: number; price: number }>()
    for (const p of preferred) {
      const d = new Date(p.asOf)
      const t = d.getTime()
      if (!Number.isFinite(t)) continue
      const wk = weekKey(d)
      const prev = byWeek.get(wk)
      // Keep the latest point within the week.
      if (!prev || t > prev.t) byWeek.set(wk, { t, price: p.price })
    }

    return Array.from(byWeek.entries())
      .map(([wk, v]) => {
        const d = new Date(v.t)
        const q = qualityByWeek.get(wk)
        return { x: d, y: v.price, strokeColor: q } // undefined => commodity color
      })
      .sort((a, b) => a.x.getTime() - b.x.getTime())
  }, [marketPrices, commodityOrders, overlayMode, selectedCommodity])

  const priceSeriesSingle: Series[] = useMemo(() => {
    if (overlayMode) return []
    if (!selectedCommodity) return []
    const color = commodityColors.get(selectedCommodity.toLowerCase()) || '#00d4aa'
    return [
      {
        id: `price-${selectedCommodity}`,
        name: 'Unit Price',
        points: pricePoints,
        color,
        yAxis: 'left',
        valueFormat: 'currency',
      },
    ]
  }, [overlayMode, selectedCommodity, pricePoints, commodityColors])

  const mainXDomain = useMemo(() => {
    if (overlayMode) return undefined
    const all: Point[] = [...costPoints, ...inventoryPoints, ...pricePoints]
    if (!all.length) return undefined
    const xs = all.map((p) => p.x.getTime())
    const min = Math.min(...xs)
    const max = Math.max(...xs)
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined
    return { min: new Date(min), max: new Date(max) }
  }, [overlayMode, costPoints, inventoryPoints, pricePoints])

  const selectedCommodityData = commodities.find(c => c.id === selectedCommodity)
  const durationLabel = DURATIONS.find(d => d.id === duration)?.label || 'All Time'

  // Calculate total for overlay selection
  const overlayTotal = useMemo(() => {
    if (!overlayMode) return 0
    return commodities
      .filter(c => overlaySelection.has(c.id))
      .reduce((sum, c) => sum + c.totalCost, 0)
  }, [overlayMode, overlaySelection, commodities])

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner" />
        <span>Loading purchase orders...</span>
      </div>
    )
  }

  if (error) {
    return <div className="error">{error}</div>
  }

  return (
    <>
      {/* Duration filters at the top */}
      <div className="filters-bar">
        <span className="filters-label">Time Period:</span>
        <div className="filters">
          {DURATIONS.map((d) => (
            <button
              key={d.id}
              className={`filter-btn ${duration === d.id ? 'active' : ''}`}
              onClick={() => setDuration(d.id)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <span className="filters-summary">
          {filteredOrders.length} orders across {commodities.length} commodities
        </span>
      </div>

      <div className="commodities-layout">
        <div className="panel commodity-list-panel">
          <div className="panel-header">
            <h3 className="panel-title">Commodities ({durationLabel})</h3>
            <button 
              className={`overlay-toggle ${overlayMode ? 'active' : ''}`}
              onClick={handleToggleOverlay}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
              </svg>
              Overlay
            </button>
          </div>
          
          {overlayMode && (
            <div className="overlay-hint">
              Click commodities to compare them on the same chart
            </div>
          )}
          
          <div className="list">
            {commodities.map((c) => {
              if (companyCommodityIds.length > 0 && !companyCommodityIds.includes(c.id)) {
                return null
              }
              const isSelected = overlayMode 
                ? overlaySelection.has(c.id)
                : selectedCommodity === c.id
              const color = commodityColors.get(c.id.toLowerCase()) || '#3b82f6'
              const inv = inventoryByCommodity.get(c.id)
              const meta = registryById.get(c.id.toLowerCase())
              const displayName = meta?.displayName || c.name
              const ticker = meta?.ticker
              const providerName = meta?.providerName
              const cardStyle: React.CSSProperties = isSelected
                ? {
                    borderColor: color,
                    boxShadow: `0 10px 30px ${hexToRgba(color, 0.25)}`,
                    background: hexToRgba(color, 0.08),
                  }
                : {}
              
              return (
                <div
                  key={c.id}
                  className={`commodity-card ${isSelected ? 'active' : ''} ${overlayMode ? 'overlay-mode' : ''}`}
                  onClick={() => handleCommodityClick(c.id)}
                  style={
                    overlayMode && isSelected
                      ? {
                          ...cardStyle,
                          '--overlay-color': color,
                        } as React.CSSProperties
                      : cardStyle
                  }
                >
                  <div className="commodity-header">
                    {overlayMode && (
                      <span 
                        className="overlay-indicator"
                        style={{ backgroundColor: isSelected ? color : 'transparent', borderColor: color }}
                      />
                    )}
                    <span className="commodity-emoji">{getCommodityEmoji(c.id)}</span>
                    <span className="commodity-name">{displayName}</span>
                  </div>
                  
                  <div className="commodity-stats">
                    <div className="stat-row">
                      <span className="stat-label">Orders</span>
                      <span className="stat-value">{c.totalOrders}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Ticker</span>
                      <span className="stat-value">{ticker || '—'}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Provider</span>
                      <span className="stat-value">{providerName || '—'}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Total Units</span>
                      <span className="stat-value">{formatNumber(c.totalUnits)} {c.unit}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Inventory</span>
                      <span
                        className="inventory-chip"
                        style={{
                          backgroundColor: hexToRgba(color, 0.12),
                          borderColor: hexToRgba(color, 0.45),
                          color,
                        }}
                        title={inv?.asOf ? `As of ${new Date(inv.asOf).toLocaleDateString()}` : undefined}
                      >
                        {inv ? `${formatNumber(inv.onHand)} ${inv.unit}` : '—'}
                      </span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Total Cost</span>
                      <span className="stat-value highlight" style={{ color }}>
                        {formatCurrency(c.totalCost)}
                      </span>
                    </div>
                  </div>

                  <div className="commodity-price-stats">
                    <div className="price-stat">
                      <span className="price-label">Min</span>
                      <span className="price-value" style={{ color }}>${c.minPrice.toFixed(2)}</span>
                    </div>
                    <div className="price-stat">
                      <span className="price-label">Avg</span>
                      <span className="price-value avg" style={{ color }}>${c.avgPrice.toFixed(2)}</span>
                    </div>
                    <div className="price-stat">
                      <span className="price-label">Max</span>
                      <span className="price-value" style={{ color }}>${c.maxPrice.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="panel chart-panel">
          {overlayMode ? (
            <div className="chart-header">
              <div className="chart-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" />
                  <path d="M3 15h18" />
                </svg>
                <div>
                  <h3>Comparison View</h3>
                  <span className="chart-subtitle">
                    {overlaySelection.size} commodities selected ({durationLabel})
                  </span>
                </div>
              </div>
              <div className="chart-summary">
                <div className="summary-stat">
                  <span className="summary-label">Combined Total</span>
                  <span className="summary-value">{formatCurrency(overlayTotal)}</span>
                </div>
              </div>
            </div>
          ) : selectedCommodityData && (
            <div className="chart-header">
              <div className="chart-title">
                <span className="commodity-emoji large">{getCommodityEmoji(selectedCommodityData.id)}</span>
                <div>
                  <h3>
                    {registryById.get(selectedCommodityData.id.toLowerCase())?.displayName || selectedCommodityData.name}
                  </h3>
                  <span className="chart-subtitle">
                    Cost over time ({durationLabel})
                  </span>
                </div>
              </div>
              <div className="chart-summary">
                <div className="summary-stat">
                  <span className="summary-label">Total Spent</span>
                  <span
                    className="summary-value"
                    style={{ color: commodityColors.get(selectedCommodityData.id.toLowerCase()) || undefined }}
                  >
                    {formatCurrency(selectedCommodityData.totalCost)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Legend for overlay mode */}
          {overlayMode && overlaySelection.size > 0 && (
            <div className="chart-legend">
              {chartSeries.map(s => (
                <div key={s.id} className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: s.color }} />
                  <span className="legend-label">{s.name}</span>
                </div>
              ))}
            </div>
          )}

          <div className="chart-container">
            {overlayMode ? (
              <LineChart
                key={`overlay-${duration}-${Array.from(overlaySelection).join(',')}`}
                series={chartSeries}
              />
            ) : (
              <SplitChart
                topSeries={singleModeSeries}
                bottomSeries={priceSeriesSingle}
                pinnedX={pinnedX}
                xDomain={mainXDomain}
                topHeight={320}
                bottomHeight={130}
                qualitySpend={qualitySpend}
              />
            )}
          </div>

          <table className="data-table">
            <thead>
              <tr>
                {overlayMode && <th>Commodity</th>}
                <th>Date</th>
                <th>Quantity</th>
                <th>Price/Unit</th>
                <th>Total</th>
                <th>Pricing</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {commodityOrders.slice(0, 10).map((o) => {
                const st = formatPurchaseStatus(o.status)
                return (
                  <tr
                    key={o.id}
                    className={!overlayMode && selectedOrderId === o.id ? 'selected' : ''}
                    onClick={() => {
                      if (overlayMode) return
                      const t = new Date(o.createdAt)
                      setPinnedX((prev) => (prev && prev.getTime() === t.getTime() ? null : t))
                      setSelectedOrderId((prev) => (prev === o.id ? null : o.id))
                    }}
                    style={!overlayMode ? { cursor: 'pointer' } : undefined}
                    title={!overlayMode ? 'Click to pin this order on the chart' : undefined}
                  >
                    {overlayMode && (
                      <td>
                        <span
                          className="table-commodity-indicator"
                          style={{ backgroundColor: commodityColors.get(o.commodityId) }}
                        />
                        {o.commodityName}
                      </td>
                    )}
                    <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                    <td className="mono">
                      {o.quantity} {o.unit}
                    </td>
                    <td className="mono">${o.pricePerUnit.toFixed(2)}</td>
                    <td className="mono">${(o.pricePerUnit * o.quantity).toFixed(2)}</td>
                    <td>
                      {o.quality && (
                        <span className={`quality-chip ${o.quality}`}>
                          {o.quality === 'value' ? 'Good price' : o.quality === 'overpay' ? 'High price' : 'Fair'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`status-tag ${st.className}`}>{st.label}</span>
                    </td>
                  </tr>
                )
              })}
              {commodityOrders.length === 0 && (
                <tr>
                  <td colSpan={overlayMode ? 7 : 6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    {overlayMode ? 'Select commodities to see data' : 'No orders in this time period'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export default function App() {
  const [nav, setNav] = useState<NavId>('commodities')
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [inventorySnapshots, setInventorySnapshots] = useState<InventoryItem[]>([])
  const [commodityRegistry, setCommodityRegistry] = useState<
    Array<{
      id: string
      name: string
      displayName: string
      unit: string
      ticker: string
      providerId: string
      providerName: string
      emoji: string
    }>
  >([])
  const [companyCommodities, setCompanyCommodities] = useState<
    Array<{ commodityId: string; commodityName: string; unit: string }>
  >([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [ordersData, inventoryData, inventorySnapshotsData, registryData, companyCommoditiesData] = await Promise.all([
          fetchPurchaseOrders(),
          fetchInventory(),
          fetchInventorySnapshots(),
          fetchCommodityRegistry(),
          fetchCompanyCommodities(),
        ])
        setOrders(ordersData)
        setInventory(inventoryData)
        setInventorySnapshots(inventorySnapshotsData)
        setCommodityRegistry(registryData as any)
        setCompanyCommodities(companyCommoditiesData as any)
      } catch (err) {
        log.error('Failed to load data', err)
        setError('Failed to load data')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const getPageTitle = () => {
    switch (nav) {
      case 'commodities':
        return { title: 'Commodities', subtitle: 'View purchases and price trends' }
      case 'positions':
        return { title: 'Positions', subtitle: 'Monitor your hedging portfolio' }
      case 'trade':
        return { title: 'Trade', subtitle: 'Execute and manage orders' }
    }
  }

  const { title, subtitle } = getPageTitle()

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <FinosLogo />
          <span>finos</span>
        </div>
        <nav className="nav-section">
          {NAV_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`nav-item ${nav === item.id ? 'active' : ''}`}
              onClick={() => setNav(item.id)}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </div>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="header" key={nav}>
          <div>
            <h1>{title}</h1>
            <span className="header-subtitle">{subtitle}</span>
          </div>
        </div>

        {nav === 'commodities' && (
          <CommoditiesView
            orders={orders}
            inventory={inventory}
            inventorySnapshots={inventorySnapshots}
            commodityRegistry={commodityRegistry}
            companyCommodities={companyCommodities}
            loading={loading}
            error={error}
          />
        )}
        {nav === 'positions' && <UnderConstruction feature="positions" />}
        {nav === 'trade' && <UnderConstruction feature="trade" />}
      </main>
    </div>
  )
}

// Export helpers for tests
export { groupCommodities, filterByDuration }
