import React, { useEffect, useRef, useState, useCallback } from 'react'

export type Point = { x: Date; y: number; strokeColor?: string }

export type Series = {
  id: string
  name: string
  points: Point[]
  color: string
  type?: 'line' | 'bar'
  dash?: string
  yAxis?: 'left' | 'right'
  unit?: string
  valueFormat?: 'currency' | 'number'
  strokeColor?: string
}

type Props = {
  points?: Point[]  // Single series (backward compatible)
  series?: Series[] // Multiple series for overlay mode
  height?: number
  pinnedX?: Date | null
  minYZero?: boolean
  hideAreas?: boolean
  xDomain?: { min: Date; max: Date }
  showXAxis?: boolean
}

type ScaledPoint = { x: number; y: number; originalX: Date; originalY: number; strokeColor?: string }

type ScaledSeries = {
  id: string
  name: string
  color: string
  strokeColor?: string
  dash?: string
  yAxis: 'left' | 'right'
  unit?: string
  valueFormat: 'currency' | 'number'
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

function formatNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toFixed(0)
}

function formatDate(date: Date, range: number): string {
  if (range <= 90) {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function createPath(scaledPoints: ScaledPoint[]): string {
  if (scaledPoints.length === 0) return ''
  
  let pathD = `M ${scaledPoints[0].x},${scaledPoints[0].y}`
  
  // Straight segments between points (no smoothing)
  for (let i = 1; i < scaledPoints.length; i++) {
    pathD += ` L ${scaledPoints[i].x},${scaledPoints[i].y}`
  }
  
  return pathD
}

function interpolateAt(points: Point[], x: Date): number | null {
  if (!points.length) return null
  const sorted = points.slice().sort((a, b) => a.x.getTime() - b.x.getTime())
  const t = x.getTime()

  const tFirst = sorted[0].x.getTime()
  const tLast = sorted[sorted.length - 1].x.getTime()
  if (t <= tFirst) return sorted[0].y
  if (t >= tLast) return sorted[sorted.length - 1].y

  for (let i = 0; i < sorted.length - 1; i++) {
    const t0 = sorted[i].x.getTime()
    const t1 = sorted[i + 1].x.getTime()
    if (t >= t0 && t <= t1) {
      const ratio = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
      return sorted[i].y + ratio * (sorted[i + 1].y - sorted[i].y)
    }
  }
  return null
}

function scaleMultipleSeries(
  seriesList: Series[],
  width: number,
  height: number,
  opts?: { minYZero?: boolean; xDomain?: { min: Date; max: Date } }
): {
  scaledSeries: ScaledSeries[]
  minYLeft: number
  maxYLeft: number
  minYRight: number
  maxYRight: number
  minX: number
  maxX: number
} {
  // Global X range, per-axis Y ranges
  const allPoints = seriesList.flatMap((s) => s.points)
  
  if (allPoints.length === 0) {
    return { scaledSeries: [], minYLeft: 0, maxYLeft: 0, minYRight: 0, maxYRight: 0, minX: 0, maxX: 0 }
  }

  const xs = allPoints.map((p) => p.x.getTime())
  const dataMinX = Math.min(...xs)
  const dataMaxX = Math.max(...xs)
  const minX = opts?.xDomain ? opts.xDomain.min.getTime() : dataMinX
  const maxX = opts?.xDomain ? opts.xDomain.max.getTime() : dataMaxX
  const spanX = maxX === minX ? 1 : maxX - minX

  const chartWidth = width - PADDING.left - PADDING.right
  const chartHeight = height - PADDING.top - PADDING.bottom

  const leftYs = seriesList
    .filter((s) => (s.yAxis ?? 'left') === 'left')
    .flatMap((s) => s.points.map((p) => p.y))
  const rightYs = seriesList
    .filter((s) => (s.yAxis ?? 'left') === 'right')
    .flatMap((s) => s.points.map((p) => p.y))

  const dataMinYLeft = leftYs.length ? Math.min(...leftYs) : 0
  const dataMaxYLeft = leftYs.length ? Math.max(...leftYs) : 0
  const minYLeft =
    leftYs.length === 0 ? 0 : opts?.minYZero ? 0 : dataMinYLeft * 0.9
  const maxYLeft =
    leftYs.length === 0 ? 0 : opts?.minYZero ? dataMaxYLeft * 1.1 : dataMaxYLeft * 1.1
  const spanYLeft = maxYLeft === minYLeft ? 1 : maxYLeft - minYLeft

  const dataMinYRight = rightYs.length ? Math.min(...rightYs) : 0
  const dataMaxYRight = rightYs.length ? Math.max(...rightYs) : 0
  const minYRight = rightYs.length ? dataMinYRight * 0.9 : 0
  const maxYRight = rightYs.length ? dataMaxYRight * 1.1 : 0
  const spanYRight = maxYRight === minYRight ? 1 : maxYRight - minYRight

  const scaledSeries = seriesList.map((series) => {
    const yAxis: 'left' | 'right' = series.yAxis ?? 'left'
    const minY = yAxis === 'right' ? minYRight : minYLeft
    const spanY = yAxis === 'right' ? spanYRight : spanYLeft

    const scaledPoints = series.points
      .slice()
      .sort((a, b) => a.x.getTime() - b.x.getTime())
      .map((p) => {
        const px = PADDING.left + ((p.x.getTime() - minX) / spanX) * chartWidth
        const py = PADDING.top + chartHeight - ((p.y - minY) / spanY) * chartHeight
        return { x: px, y: py, originalX: p.x, originalY: p.y, strokeColor: p.strokeColor }
      })
    
    return {
      id: series.id,
      name: series.name,
      color: series.color,
      dash: series.dash,
      yAxis,
      unit: series.unit,
      valueFormat: series.valueFormat ?? (yAxis === 'left' ? 'currency' : 'number'),
      pathD: createPath(scaledPoints),
      scaledPoints
    }
  })

  return { scaledSeries, minYLeft, maxYLeft, minYRight, maxYRight, minX, maxX }
}

export const LineChart: React.FC<Props> = ({
  points,
  series,
  height = 300,
  pinnedX,
  minYZero = false,
  hideAreas = false,
  xDomain,
  showXAxis = true,
}) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [isAnimating, setIsAnimating] = useState(true)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [width, setWidth] = useState(900)

  useEffect(() => {
    function measure() {
      const parent = svgRef.current?.parentElement
      if (parent) {
        const rect = parent.getBoundingClientRect()
        const target = Math.max(700, rect.width * 0.9)
        setWidth(target)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Convert single points to series format for unified handling
  const effectiveSeries: Series[] = series || (points ? [{
    id: 'default',
    name: 'Value',
    points: points,
    color: '#00d4aa',
    yAxis: 'left',
    valueFormat: 'currency',
  }] : [])

  const isOverlayMode = effectiveSeries.length > 1
  
  const { scaledSeries, minYLeft, maxYLeft, minYRight, maxYRight, minX, maxX } = scaleMultipleSeries(
    effectiveSeries,
    width,
    height,
    { minYZero, xDomain }
  )
  const chartHeight = height - PADDING.top - PADDING.bottom
  const chartWidth = width - PADDING.left - PADDING.right

  useEffect(() => {
    setIsAnimating(true)
    const timer = setTimeout(() => setIsAnimating(false), 1500)
    return () => clearTimeout(timer)
  }, [points, series])

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    // Use the SVG CTM to map screen coords -> SVG coords.
    // This stays accurate even if the SVG is scaled with a different aspect ratio.
    const ctm = svgRef.current.getScreenCTM()
    if (!ctm) return
    const inv = ctm.inverse()
    const pt = svgRef.current.createSVGPoint()
    pt.x = e.clientX
    pt.y = e.clientY
    const svgPt = pt.matrixTransform(inv)

    const x = svgPt.x
    const y = svgPt.y

    const inX = x >= PADDING.left && x <= width - PADDING.right
    const inY = y >= PADDING.top && y <= height - PADDING.bottom
    setHoverX(inX && inY ? x : null)
  }, [width, height])

  const handleMouseLeave = useCallback(() => {
    setHoverX(null)
  }, [])

  // Generate Y axis ticks (left)
  const yTicks: number[] = []
  const yTickCount = 5
  if (maxYLeft > minYLeft) {
    for (let i = 0; i <= yTickCount; i++) {
      yTicks.push(minYLeft + ((maxYLeft - minYLeft) / yTickCount) * i)
    }
  }

  const hasRightAxis = scaledSeries.some((s) => s.yAxis === 'right')
  const yTicksRight: number[] = []
  if (hasRightAxis && maxYRight > minYRight) {
    for (let i = 0; i <= yTickCount; i++) {
      yTicksRight.push(minYRight + ((maxYRight - minYRight) / yTickCount) * i)
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

  const pinnedXCoord =
    pinnedX && maxX > minX
      ? PADDING.left + ((pinnedX.getTime() - minX) / (maxX - minX)) * chartWidth
      : null

  const activeX =
    hoverX !== null
      ? hoverX
      : pinnedXCoord !== null && pinnedXCoord >= PADDING.left && pinnedXCoord <= width - PADDING.right
        ? pinnedXCoord
        : null

  const activeTime =
    activeX !== null && maxX > minX
      ? new Date(minX + ((activeX - PADDING.left) / chartWidth) * (maxX - minX))
      : null

  const activeValues =
    activeTime !== null
      ? effectiveSeries.map((s) => ({ series: s, y: interpolateAt(s.points, activeTime) }))
      : []

  const hasData = scaledSeries.some(s => s.scaledPoints.length > 0)
  const barSeries = scaledSeries.filter((s) => (effectiveSeries.find(es => es.id === s.id)?.type ?? 'line') === 'bar')
  const lineSeries = scaledSeries.filter((s) => (effectiveSeries.find(es => es.id === s.id)?.type ?? 'line') === 'line')

  // Determine bar width based on spacing
  let barWidth = 24
  const xPositions = barSeries.flatMap((s) => s.scaledPoints.map((p) => p.x)).sort((a, b) => a - b)
  if (xPositions.length > 1) {
    let minGap = Infinity
    for (let i = 1; i < xPositions.length; i++) {
      minGap = Math.min(minGap, xPositions[i] - xPositions[i - 1])
    }
    if (minGap !== Infinity) {
      barWidth = Math.max(8, Math.min(40, minGap * 0.8))
    }
  }

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
      {showXAxis && (
        <line
          x1={PADDING.left}
          y1={height - PADDING.bottom}
          x2={width - PADDING.right}
          y2={height - PADDING.bottom}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="1"
        />
      )}

      {/* Y axis grid lines and labels */}
      {yTicks.map((tick, i) => {
        const y = PADDING.top + chartHeight - ((tick - minYLeft) / (maxYLeft - minYLeft || 1)) * chartHeight
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

      {/* Right Y Axis labels (Inventory) */}
      {hasRightAxis &&
        yTicksRight.map((tick, i) => {
          const y = PADDING.top + chartHeight - ((tick - minYRight) / (maxYRight - minYRight || 1)) * chartHeight
          return (
            <text
              key={`yr-${i}`}
              x={width - PADDING.right + 10}
              y={y + 4}
              textAnchor="start"
              fill="#5c6c7a"
              fontSize="11"
              fontFamily="var(--font-mono, monospace)"
            >
              {formatNumber(tick)}
            </text>
          )
        })}

      {/* X axis labels */}
      {showXAxis &&
        xTicks.map((tick, i) => (
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

      {hasRightAxis && (
        <text
          x={width - 15}
          y={height / 2}
          textAnchor="middle"
          fill="#5c6c7a"
          fontSize="11"
          transform={`rotate(-90, ${width - 15}, ${height / 2})`}
        >
          Inventory
        </text>
      )}

      {hasData ? (
        <>
          {/* Area fills (only for single line series unless hidden) */}
          {!isOverlayMode && !hideAreas && lineSeries.map(s => s.scaledPoints.length > 1 && (
            <path
              key={`area-${s.id}`}
              d={`${s.pathD} L ${s.scaledPoints[s.scaledPoints.length - 1].x},${height - PADDING.bottom} L ${s.scaledPoints[0].x},${height - PADDING.bottom} Z`}
              fill={`url(#areaGradient-${s.id})`}
              className="chart-area"
            />
          ))}
          
      {/* Bars */}
      {barSeries.map((s) =>
        s.scaledPoints.map((p, idx) => {
          const yAxis = s.yAxis ?? 'left'
          const minY = yAxis === 'right' ? minYRight : minYLeft
          const maxY = yAxis === 'right' ? maxYRight : maxYLeft
          const baseY = PADDING.top + chartHeight - ((0 - minY) / (maxY - minY || 1)) * chartHeight
          const heightPx = baseY - p.y
          const barTopY = heightPx >= 0 ? p.y : p.y + heightPx
          return (
            <g key={`bar-${s.id}-${idx}`}>
              <rect
                x={p.x - barWidth / 2}
                y={barTopY}
                width={barWidth}
                height={Math.abs(heightPx)}
                // Bars stay commodity-colored; quality is shown elsewhere.
                fill={s.color}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
                opacity={0.9}
                rx={3}
              />
            </g>
          )
        })
      )}

          {/* Lines for each series */}
          {lineSeries.map((s, idx) => s.scaledPoints.length > 0 && (
            <path
              key={`line-${s.id}`}
              d={s.pathD}
              fill="none"
              stroke={s.color}
              strokeDasharray={s.dash}
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
          {!isAnimating && lineSeries.map(s => 
            (isOverlayMode ? s.scaledPoints.filter((_, i, arr) => i === 0 || i === arr.length - 1) : s.scaledPoints).map((p, i) => (
              <circle
                key={`point-${s.id}-${i}`}
                cx={p.x}
                cy={p.y}
                r={3}
                fill="#0a0e17"
                stroke={p.strokeColor ?? s.color}
                strokeWidth="2"
              />
            ))
          )}

          {/* Crosshair + interpolated values (hover or pinned) */}
          {activeX !== null && activeTime !== null && activeValues.length > 0 && (
            <>
              <line
                x1={activeX}
                y1={PADDING.top}
                x2={activeX}
                y2={height - PADDING.bottom}
                stroke="rgba(255, 255, 255, 0.3)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />

              {activeValues.map((v) => {
                if (v.y === null) return null
                const yAxis = v.series.yAxis ?? 'left'
                const minY = yAxis === 'right' ? minYRight : minYLeft
                const maxY = yAxis === 'right' ? maxYRight : maxYLeft
                const py = PADDING.top + chartHeight - ((v.y - minY) / (maxY - minY || 1)) * chartHeight
                return (
                  <circle
                    key={`active-${v.series.id}`}
                    cx={activeX}
                    cy={py}
                    r="6"
                    fill={v.series.color}
                    stroke="#0a0e17"
                    strokeWidth="2"
                  />
                )
              })}

              <g>
                <rect
                  x={Math.min(Math.max(activeX - 90, PADDING.left), width - PADDING.right - 180)}
                  y={PADDING.top + 10}
                  width={180}
                  height={20 + activeValues.length * 22}
                  rx={6}
                  fill="#1a2332"
                  stroke="rgba(255, 255, 255, 0.2)"
                  strokeWidth="1"
                />
                <text
                  x={Math.min(Math.max(activeX, PADDING.left + 90), width - PADDING.right - 90)}
                  y={PADDING.top + 26}
                  textAnchor="middle"
                  fill="#8899a6"
                  fontSize="10"
                >
                  {activeTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </text>
                {activeValues.map((v, idx) => {
                  const fmt = v.series.valueFormat ?? ((v.series.yAxis ?? 'left') === 'left' ? 'currency' : 'number')
                  const valueText =
                    v.y === null
                      ? '—'
                      : fmt === 'currency'
                        ? formatCurrency(v.y)
                        : `${formatNumber(v.y)}${v.series.unit ? ` ${v.series.unit}` : ''}`
                  return (
                    <g key={`tooltip-text-${v.series.id}`}>
                      <circle
                        cx={Math.min(Math.max(activeX - 75, PADDING.left + 15), width - PADDING.right - 165)}
                        cy={PADDING.top + 42 + idx * 22}
                        r="4"
                        fill={v.series.color}
                      />
                      <text
                        x={Math.min(Math.max(activeX - 65, PADDING.left + 25), width - PADDING.right - 155)}
                        y={PADDING.top + 46 + idx * 22}
                        fill={v.series.color}
                        fontSize="12"
                        fontWeight="500"
                      >
                        {isOverlayMode ? `${v.series.name.slice(0, 10)} ` : ''}
                        {valueText}
                      </text>
                    </g>
                  )
                })}
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
