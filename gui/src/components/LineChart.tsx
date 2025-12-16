import React, { useEffect, useRef, useState, useCallback } from 'react'

export type Point = { x: Date; y: number }

export type Series = {
  id: string
  name: string
  points: Point[]
  color: string
}

type Props = {
  points?: Point[]  // Single series (backward compatible)
  series?: Series[] // Multiple series for overlay mode
  height?: number
}

type ScaledPoint = { x: number; y: number; originalX: Date; originalY: number }

type ScaledSeries = {
  id: string
  name: string
  color: string
  pathD: string
  scaledPoints: ScaledPoint[]
}

const PADDING = { top: 20, right: 20, bottom: 45, left: 70 }

// Colors for overlay mode - distinct, vibrant colors
export const SERIES_COLORS = [
  '#00d4aa', // Teal (primary)
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#84cc16', // Lime
  '#ef4444', // Red
  '#6366f1', // Indigo
  '#14b8a6', // Teal variant
  '#a855f7', // Violet
  '#eab308', // Yellow
]

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatDate(date: Date, range: number): string {
  if (range <= 30) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  if (range <= 365) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}

function createPath(scaledPoints: ScaledPoint[]): string {
  if (scaledPoints.length === 0) return ''
  
  let pathD = `M ${scaledPoints[0].x},${scaledPoints[0].y}`
  
  if (scaledPoints.length === 2) {
    pathD += ` L ${scaledPoints[1].x},${scaledPoints[1].y}`
  } else if (scaledPoints.length > 2) {
    for (let i = 0; i < scaledPoints.length - 1; i++) {
      const p0 = scaledPoints[Math.max(0, i - 1)]
      const p1 = scaledPoints[i]
      const p2 = scaledPoints[i + 1]
      const p3 = scaledPoints[Math.min(scaledPoints.length - 1, i + 2)]

      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6

      pathD += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
    }
  }
  
  return pathD
}

function scaleMultipleSeries(
  seriesList: Series[],
  width: number,
  height: number
): {
  scaledSeries: ScaledSeries[]
  minY: number
  maxY: number
  minX: number
  maxX: number
} {
  // Collect all points to find global min/max
  const allPoints = seriesList.flatMap(s => s.points)
  
  if (allPoints.length === 0) {
    return { scaledSeries: [], minY: 0, maxY: 0, minX: 0, maxX: 0 }
  }

  const xs = allPoints.map((p) => p.x.getTime())
  const ys = allPoints.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const dataMinY = Math.min(...ys)
  const dataMaxY = Math.max(...ys)
  const minY = dataMinY * 0.9
  const maxY = dataMaxY * 1.1
  const spanX = maxX === minX ? 1 : maxX - minX
  const spanY = maxY === minY ? 1 : maxY - minY

  const chartWidth = width - PADDING.left - PADDING.right
  const chartHeight = height - PADDING.top - PADDING.bottom

  const scaledSeries = seriesList.map(series => {
    const scaledPoints = series.points
      .sort((a, b) => a.x.getTime() - b.x.getTime())
      .map((p) => {
        const px = PADDING.left + ((p.x.getTime() - minX) / spanX) * chartWidth
        const py = PADDING.top + chartHeight - ((p.y - minY) / spanY) * chartHeight
        return { x: px, y: py, originalX: p.x, originalY: p.y }
      })
    
    return {
      id: series.id,
      name: series.name,
      color: series.color,
      pathD: createPath(scaledPoints),
      scaledPoints
    }
  })

  return { scaledSeries, minY, maxY, minX, maxX }
}

export const LineChart: React.FC<Props> = ({ points, series, height = 300 }) => {
  const width = 700
  const svgRef = useRef<SVGSVGElement>(null)
  const [isAnimating, setIsAnimating] = useState(true)
  const [hoverX, setHoverX] = useState<number | null>(null)

  // Convert single points to series format for unified handling
  const effectiveSeries: Series[] = series || (points ? [{
    id: 'default',
    name: 'Value',
    points: points,
    color: '#00d4aa'
  }] : [])

  const isOverlayMode = effectiveSeries.length > 1
  
  const { scaledSeries, minY, maxY, minX, maxX } = scaleMultipleSeries(effectiveSeries, width, height)
  const chartHeight = height - PADDING.top - PADDING.bottom
  const chartWidth = width - PADDING.left - PADDING.right

  useEffect(() => {
    setIsAnimating(true)
    const timer = setTimeout(() => setIsAnimating(false), 1500)
    return () => clearTimeout(timer)
  }, [points, series])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * width
    
    if (x >= PADDING.left && x <= width - PADDING.right) {
      setHoverX(x)
    } else {
      setHoverX(null)
    }
  }, [width])

  const handleMouseLeave = useCallback(() => {
    setHoverX(null)
  }, [])

  // Generate Y axis ticks
  const yTicks: number[] = []
  const yTickCount = 5
  if (maxY > minY) {
    for (let i = 0; i <= yTickCount; i++) {
      yTicks.push(minY + ((maxY - minY) / yTickCount) * i)
    }
  }

  // Generate X axis ticks (dates)
  const xTicks: { value: number; label: string }[] = []
  if (scaledSeries.length > 0 && maxX > minX) {
    const dateRange = (maxX - minX) / (1000 * 60 * 60 * 24)
    const tickCount = 6
    for (let i = 0; i < tickCount; i++) {
      const ratio = i / (tickCount - 1 || 1)
      const timestamp = minX + ratio * (maxX - minX)
      const px = PADDING.left + ratio * chartWidth
      xTicks.push({
        value: px,
        label: formatDate(new Date(timestamp), dateRange)
      })
    }
  }

  // Find hovered points for each series
  const hoveredPoints = hoverX !== null ? scaledSeries.map(s => {
    let closest = s.scaledPoints[0]
    let closestDist = Infinity
    s.scaledPoints.forEach(p => {
      const dist = Math.abs(p.x - hoverX)
      if (dist < closestDist) {
        closestDist = dist
        closest = p
      }
    })
    return { series: s, point: closest }
  }).filter(h => h.point) : []

  const hasData = scaledSeries.some(s => s.scaledPoints.length > 0)

  return (
    <svg 
      ref={svgRef}
      role="img" 
      aria-label="line-chart" 
      width="100%" 
      height={height} 
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible', cursor: 'crosshair' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        {/* Gradients for each series */}
        {scaledSeries.map((s) => (
          <linearGradient key={`area-${s.id}`} id={`areaGradient-${s.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity={isOverlayMode ? "0.1" : "0.2"} />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
        
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>

      {/* Chart area background */}
      <rect
        x={PADDING.left}
        y={PADDING.top}
        width={chartWidth}
        height={chartHeight}
        fill="rgba(255,255,255,0.01)"
      />

      {/* Y Axis */}
      <line
        x1={PADDING.left}
        y1={PADDING.top}
        x2={PADDING.left}
        y2={height - PADDING.bottom}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />

      {/* X Axis */}
      <line
        x1={PADDING.left}
        y1={height - PADDING.bottom}
        x2={width - PADDING.right}
        y2={height - PADDING.bottom}
        stroke="rgba(255,255,255,0.1)"
        strokeWidth="1"
      />

      {/* Y axis grid lines and labels */}
      {yTicks.map((tick, i) => {
        const y = PADDING.top + chartHeight - ((tick - minY) / (maxY - minY)) * chartHeight
        return (
          <g key={`y-${i}`}>
            <line
              x1={PADDING.left}
              y1={y}
              x2={width - PADDING.right}
              y2={y}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
              strokeDasharray={i === 0 ? "none" : "4,4"}
            />
            <text
              x={PADDING.left - 10}
              y={y + 4}
              textAnchor="end"
              fill="#5c6c7a"
              fontSize="11"
              fontFamily="var(--font-mono, monospace)"
            >
              {formatCurrency(tick)}
            </text>
          </g>
        )
      })}

      {/* X axis labels */}
      {xTicks.map((tick, i) => (
        <text
          key={`x-${i}`}
          x={tick.value}
          y={height - PADDING.bottom + 20}
          textAnchor="middle"
          fill="#5c6c7a"
          fontSize="11"
          fontFamily="var(--font-sans)"
        >
          {tick.label}
        </text>
      ))}

      {/* Y axis title */}
      <text
        x={15}
        y={height / 2}
        textAnchor="middle"
        fill="#5c6c7a"
        fontSize="11"
        transform={`rotate(-90, 15, ${height / 2})`}
      >
        Cost ($)
      </text>

      {hasData ? (
        <>
          {/* Area fills (only for single series) */}
          {!isOverlayMode && scaledSeries.map(s => s.scaledPoints.length > 1 && (
            <path
              key={`area-${s.id}`}
              d={`${s.pathD} L ${s.scaledPoints[s.scaledPoints.length - 1].x},${height - PADDING.bottom} L ${s.scaledPoints[0].x},${height - PADDING.bottom} Z`}
              fill={`url(#areaGradient-${s.id})`}
              className="chart-area"
            />
          ))}
          
          {/* Lines for each series */}
          {scaledSeries.map((s, idx) => s.scaledPoints.length > 0 && (
            <path
              key={`line-${s.id}`}
              d={s.pathD}
              fill="none"
              stroke={s.color}
              strokeWidth={isOverlayMode ? 2 : 2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              filter={isOverlayMode ? undefined : "url(#glow)"}
              className={isAnimating ? 'chart-line' : ''}
              style={{
                animationDelay: `${idx * 0.1}s`
              }}
            />
          ))}

          {/* Data points (only when not animating and limited in overlay mode) */}
          {!isAnimating && scaledSeries.map(s => 
            (isOverlayMode ? s.scaledPoints.filter((_, i, arr) => i === 0 || i === arr.length - 1) : s.scaledPoints).map((p, i) => (
              <circle
                key={`point-${s.id}-${i}`}
                cx={p.x}
                cy={p.y}
                r={3}
                fill="#0a0e17"
                stroke={s.color}
                strokeWidth="2"
              />
            ))
          )}

          {/* Vertical crosshair on hover */}
          {hoverX !== null && hoveredPoints.length > 0 && (
            <>
              <line
                x1={hoverX}
                y1={PADDING.top}
                x2={hoverX}
                y2={height - PADDING.bottom}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
              
              {/* Tooltip for each series */}
              {hoveredPoints.map((hp) => (
                <g key={`tooltip-${hp.series.id}`}>
                  {/* Dot on line */}
                  <circle
                    cx={hp.point.x}
                    cy={hp.point.y}
                    r="6"
                    fill={hp.series.color}
                    stroke="#0a0e17"
                    strokeWidth="2"
                  />
                </g>
              ))}

              {/* Combined tooltip box */}
              <g>
                <rect
                  x={Math.min(Math.max(hoverX - 80, PADDING.left), width - PADDING.right - 160)}
                  y={PADDING.top + 10}
                  width={160}
                  height={20 + hoveredPoints.length * 22}
                  rx={6}
                  fill="#1a2332"
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth="1"
                />
                {/* Date */}
                <text
                  x={Math.min(Math.max(hoverX, PADDING.left + 80), width - PADDING.right - 80)}
                  y={PADDING.top + 26}
                  textAnchor="middle"
                  fill="#8899a6"
                  fontSize="10"
                >
                  {hoveredPoints[0]?.point.originalX.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </text>
                {/* Values for each series */}
                {hoveredPoints.map((hp, idx) => (
                  <g key={`tooltip-text-${hp.series.id}`}>
                    <circle
                      cx={Math.min(Math.max(hoverX - 65, PADDING.left + 15), width - PADDING.right - 145)}
                      cy={PADDING.top + 42 + idx * 22}
                      r="4"
                      fill={hp.series.color}
                    />
                    <text
                      x={Math.min(Math.max(hoverX - 55, PADDING.left + 25), width - PADDING.right - 135)}
                      y={PADDING.top + 46 + idx * 22}
                      fill={hp.series.color}
                      fontSize="12"
                      fontWeight="500"
                    >
                      {isOverlayMode ? hp.series.name.slice(0, 8) : ''} ${hp.point.originalY.toFixed(2)}
                    </text>
                  </g>
                ))}
              </g>
            </>
          )}
        </>
      ) : (
        <g style={{ animation: 'fadeIn 0.5s ease-out' }}>
          <text 
            x="50%" 
            y="50%" 
            textAnchor="middle" 
            fill="#5c6c7a"
            fontSize="14"
            fontFamily="var(--font-sans)"
          >
            {effectiveSeries.length === 0 ? 'Select commodities to compare' : 'No data for selected period'}
          </text>
        </g>
      )}
    </svg>
  )
}
