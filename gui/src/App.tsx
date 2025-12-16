import { useEffect, useMemo, useState } from 'react'
import './index.css'
import log from 'loglevel'
import { fetchPurchaseOrders } from './api'
import type { PurchaseOrder, CommoditySummary } from './types'
import { LineChart, SERIES_COLORS } from './components/LineChart'
import type { Point, Series } from './components/LineChart'

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

// Emoji mapping for commodities
const COMMODITY_EMOJIS: Record<string, string> = {
  sugar: '🍬',
  flour: '🌾',
  butter: '🧈',
  eggs: '🥚',
  vanilla: '🌸',
  baking_soda: '🧂',
  salt: '🧂',
  chocolate: '🍫',
  milk: '🥛',
  yeast: '🍞',
  oil: '🫒',
  oats: '🥣',
  wheat: '🌾',
  corn: '🌽',
  coffee: '☕',
  cocoa: '🍫',
  cotton: '🧵',
  rice: '🍚',
  soybean: '🫘',
  default: '📦',
}

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

function getCommodityEmoji(commodityId: string): string {
  const normalized = commodityId.toLowerCase().replace(/[_-]/g, '')
  for (const [key, emoji] of Object.entries(COMMODITY_EMOJIS)) {
    if (normalized.includes(key.replace(/_/g, ''))) {
      return emoji
    }
  }
  return COMMODITY_EMOJIS.default
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
  loading,
  error,
}: {
  orders: PurchaseOrder[]
  loading: boolean
  error: string | null
}) {
  const [selectedCommodity, setSelectedCommodity] = useState<string | null>(null)
  const [overlayMode, setOverlayMode] = useState(false)
  const [overlaySelection, setOverlaySelection] = useState<Set<string>>(new Set())
  const [duration, setDuration] = useState<string>('all')

  // Filter ALL orders by duration first
  const filteredOrders = useMemo(() => {
    const durationDays = DURATIONS.find((d) => d.id === duration)?.days ?? 0
    return filterByDuration(orders, durationDays)
  }, [orders, duration])

  // Group commodities from filtered orders
  const commodities = useMemo(() => groupCommodities(filteredOrders), [filteredOrders])

  // Create color map for commodities
  const commodityColors = useMemo(() => {
    const colors = new Map<string, string>()
    commodities.forEach((c, i) => {
      colors.set(c.id, SERIES_COLORS[i % SERIES_COLORS.length])
    })
    return colors
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
    return filteredOrders.filter((o) => (selectedCommodity ? o.commodityId === selectedCommodity : true))
  }, [filteredOrders, selectedCommodity, overlayMode, overlaySelection])

  // Single series chart points (non-overlay mode)
  const chartPoints: Point[] = useMemo(() => {
    if (overlayMode) return []
    return commodityOrders
      .map((o) => ({ x: new Date(o.createdAt), y: o.pricePerUnit * o.quantity }))
      .sort((a, b) => a.x.getTime() - b.x.getTime())
  }, [commodityOrders, overlayMode])

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
        color: commodityColors.get(commodityId) || '#00d4aa'
      }
    })
  }, [overlayMode, overlaySelection, filteredOrders, commodities, commodityColors])

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
              const isSelected = overlayMode 
                ? overlaySelection.has(c.id)
                : selectedCommodity === c.id
              const color = commodityColors.get(c.id) || SERIES_COLORS[0]
              
              return (
                <div
                  key={c.id}
                  className={`commodity-card ${isSelected ? 'active' : ''} ${overlayMode ? 'overlay-mode' : ''}`}
                  onClick={() => handleCommodityClick(c.id)}
                  style={overlayMode && isSelected ? { 
                    borderColor: color,
                    '--overlay-color': color 
                  } as React.CSSProperties : undefined}
                >
                  <div className="commodity-header">
                    {overlayMode && (
                      <span 
                        className="overlay-indicator"
                        style={{ backgroundColor: isSelected ? color : 'transparent', borderColor: color }}
                      />
                    )}
                    <span className="commodity-emoji">{getCommodityEmoji(c.id)}</span>
                    <span className="commodity-name">{c.name}</span>
                  </div>
                  
                  <div className="commodity-stats">
                    <div className="stat-row">
                      <span className="stat-label">Orders</span>
                      <span className="stat-value">{c.totalOrders}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Total Units</span>
                      <span className="stat-value">{formatNumber(c.totalUnits)} {c.unit}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Total Cost</span>
                      <span className="stat-value highlight">{formatCurrency(c.totalCost)}</span>
                    </div>
                  </div>

                  <div className="commodity-price-stats">
                    <div className="price-stat">
                      <span className="price-label">Min</span>
                      <span className="price-value">${c.minPrice.toFixed(2)}</span>
                    </div>
                    <div className="price-stat">
                      <span className="price-label">Avg</span>
                      <span className="price-value avg">${c.avgPrice.toFixed(2)}</span>
                    </div>
                    <div className="price-stat">
                      <span className="price-label">Max</span>
                      <span className="price-value">${c.maxPrice.toFixed(2)}</span>
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
                  <h3>{selectedCommodityData.name}</h3>
                  <span className="chart-subtitle">
                    Cost over time ({durationLabel})
                  </span>
                </div>
              </div>
              <div className="chart-summary">
                <div className="summary-stat">
                  <span className="summary-label">Total Spent</span>
                  <span className="summary-value">{formatCurrency(selectedCommodityData.totalCost)}</span>
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
              <LineChart key={`overlay-${duration}-${Array.from(overlaySelection).join(',')}`} series={chartSeries} />
            ) : (
              <LineChart key={`${selectedCommodity}-${duration}`} points={chartPoints} />
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
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {commodityOrders.slice(0, 10).map((o) => (
                <tr key={o.id}>
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
                  <td className="mono">
                    ${o.pricePerUnit.toFixed(2)}
                  </td>
                  <td className="mono">${(o.pricePerUnit * o.quantity).toFixed(2)}</td>
                  <td>
                    <span className={`status-tag ${o.status}`}>{o.status}</span>
                  </td>
                </tr>
              ))}
              {commodityOrders.length === 0 && (
                <tr>
                  <td colSpan={overlayMode ? 6 : 5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const data = await fetchPurchaseOrders()
        setOrders(data)
      } catch (err) {
        log.error('Failed to load purchase orders', err)
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
          <CommoditiesView orders={orders} loading={loading} error={error} />
        )}
        {nav === 'positions' && <UnderConstruction feature="positions" />}
        {nav === 'trade' && <UnderConstruction feature="trade" />}
      </main>
    </div>
  )
}

// Export helpers for tests
export { groupCommodities, filterByDuration }
