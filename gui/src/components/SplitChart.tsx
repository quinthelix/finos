import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Point, Series } from './LineChart'

type XDomain = { min: Date; max: Date }

type Props = {
  /** Top panel: purchases (bar, left axis) + inventory (line, right axis) */
  topSeries: Series[]
  /** Bottom panel: unit price (line, left axis) */
  bottomSeries: Series[]
  /** Shared X domain for both panels */
  xDomain: XDomain | undefined
  height?: number
  pinnedX?: Date | null
}

const PAD = { top: 12, right: 18, bottom: 12, left: 70 }
const AXIS_GAP = 22 // tighter space around the middle x-axis line + labels

function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(1)}K`
  return `$${value.toFixed(0)}`
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—'
  if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}K`
  return value.toFixed(0)
}

function formatDate(date: Date, rangeDays: number): string {
  if (rangeDays <= 90) return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
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
      const r = t1 === t0 ? 0 : (t - t0) / (t1 - t0)
      return sorted[i].y + r * (sorted[i + 1].y - sorted[i].y)
    }
  }
  return null
}

function extent(nums: number[]): { min: number; max: number } {
  if (!nums.length) return { min: 0, max: 0 }
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

export const SplitChart: React.FC<Props> = ({ topSeries, bottomSeries, xDomain, height = 420, pinnedX }) => {
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(900)
  const [hoverX, setHoverX] = useState<number | null>(null)

  useEffect(() => {
    function measure() {
      const parent = svgRef.current?.parentElement
      if (!parent) return
      const rect = parent.getBoundingClientRect()
      setWidth(Math.max(700, rect.width * 0.98))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const chartW = width - PAD.left - PAD.right
  // Give most vertical budget to purchases+inventory; keep unit-price compact.
  const topH = Math.max(190, Math.round((height - PAD.top - PAD.bottom - AXIS_GAP) * 0.76))
  const bottomH = Math.max(78, height - PAD.top - PAD.bottom - AXIS_GAP - topH)
  const xAxisY = PAD.top + topH + AXIS_GAP / 2
  const topY0 = PAD.top
  const bottomY0 = xAxisY + AXIS_GAP / 2

  const domain = useMemo(() => {
    const all = [...topSeries.flatMap((s) => s.points), ...bottomSeries.flatMap((s) => s.points)]
    if (xDomain) return xDomain
    if (!all.length) return undefined
    const xs = all.map((p) => p.x.getTime())
    return { min: new Date(Math.min(...xs)), max: new Date(Math.max(...xs)) }
  }, [topSeries, bottomSeries, xDomain])

  const minX = domain?.min.getTime() ?? 0
  const maxX = domain?.max.getTime() ?? 0
  const spanX = maxX === minX ? 1 : maxX - minX

  const xToPx = useCallback(
    (d: Date) => PAD.left + ((d.getTime() - minX) / spanX) * chartW,
    [minX, spanX, chartW]
  )

  const topLeft = useMemo(() => {
    const ys = topSeries.filter((s) => (s.yAxis ?? 'left') === 'left').flatMap((s) => s.points.map((p) => p.y))
    const e = extent(ys)
    const min = 0
    const max = ys.length ? e.max * 1.1 : 1
    return { min, max }
  }, [topSeries])

  const topRight = useMemo(() => {
    const ys = topSeries.filter((s) => (s.yAxis ?? 'left') === 'right').flatMap((s) => s.points.map((p) => p.y))
    const e = extent(ys)
    const min = ys.length ? e.min * 0.9 : 0
    const max = ys.length ? e.max * 1.1 : 1
    return { min, max }
  }, [topSeries])

  const bottomLeft = useMemo(() => {
    const ys = bottomSeries.flatMap((s) => s.points.map((p) => p.y))
    const e = extent(ys)
    const min = 0
    const max = ys.length ? e.max * 1.1 : 1
    return { min, max }
  }, [bottomSeries])

  const topY = useCallback(
    (y: number, axis: 'left' | 'right') => {
      const r = axis === 'right' ? topRight : topLeft
      const span = r.max === r.min ? 1 : r.max - r.min
      return topY0 + topH - ((y - r.min) / span) * topH
    },
    [topLeft, topRight, topY0, topH]
  )

  const bottomY = useCallback(
    (y: number) => {
      const span = bottomLeft.max === bottomLeft.min ? 1 : bottomLeft.max - bottomLeft.min
      // y grows downward in SVG; bottom panel is below x-axis
      return bottomY0 + bottomH - ((y - bottomLeft.min) / span) * bottomH
    },
    [bottomLeft, bottomY0, bottomH]
  )

  const pinnedXCoord =
    pinnedX && domain
      ? PAD.left + ((pinnedX.getTime() - minX) / (maxX - minX || 1)) * chartW
      : null

  const activeX =
    hoverX !== null
      ? hoverX
      : pinnedXCoord !== null && pinnedXCoord >= PAD.left && pinnedXCoord <= width - PAD.right
        ? pinnedXCoord
        : null

  const activeTime =
    activeX !== null && domain
      ? new Date(minX + ((activeX - PAD.left) / chartW) * (maxX - minX))
      : null

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return
      const ctm = svgRef.current.getScreenCTM()
      if (!ctm) return
      const inv = ctm.inverse()
      const pt = svgRef.current.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const svgPt = pt.matrixTransform(inv)
      const x = svgPt.x
      const y = svgPt.y
      const inX = x >= PAD.left && x <= width - PAD.right
      const inY =
        (y >= topY0 && y <= topY0 + topH) ||
        (y >= bottomY0 && y <= bottomY0 + bottomH)
      setHoverX(inX && inY ? x : null)
    },
    [width, topY0, topH, bottomY0, bottomH]
  )

  const handleMouseLeave = useCallback(() => setHoverX(null), [])

  const rangeDays = (maxX - minX) / (1000 * 60 * 60 * 24)
  const xTicks = useMemo(() => {
    if (!domain || maxX <= minX) return []
    const tickCount = 6
    return Array.from({ length: tickCount }, (_, i) => {
      const ratio = i / (tickCount - 1 || 1)
      const t = minX + ratio * (maxX - minX)
      return { x: PAD.left + ratio * chartW, label: formatDate(new Date(t), rangeDays) }
    })
  }, [domain, minX, maxX, chartW, rangeDays])

  const topBarSeries = topSeries.filter((s) => (s.type ?? 'line') === 'bar')
  const topLineSeries = topSeries.filter((s) => (s.type ?? 'line') === 'line')
  const bottomLineSeries = bottomSeries

  // Bar width based on cost series spacing
  const barWidth = useMemo(() => {
    const xs = topBarSeries.flatMap((s) => s.points.map((p) => xToPx(p.x))).sort((a, b) => a - b)
    if (xs.length <= 1) return 24
    let minGap = Infinity
    for (let i = 1; i < xs.length; i++) minGap = Math.min(minGap, xs[i] - xs[i - 1])
    return clamp(minGap * 0.8, 8, 40)
  }, [topBarSeries, xToPx])

  // Build fast lookup for matching cost bars at exact timestamp
  const costBarTopByTime = useMemo(() => {
    const map = new Map<number, { barTopY: number; barBottomY: number; barCenterX: number }>()
    const cost = topBarSeries[0]
    if (!cost) return map
    for (const p of cost.points) {
      const t = p.x.getTime()
      const cx = xToPx(p.x)
      const y = topY(p.y, 'left')
      const baseY = topY(0, 'left')
      const h = baseY - y
      const barTopY = h >= 0 ? y : y + h
      const barBottomY = h >= 0 ? baseY : y
      map.set(t, { barTopY, barBottomY, barCenterX: cx })
    }
    return map
  }, [topBarSeries, xToPx, topY])

  const tooltipValues = useMemo(() => {
    if (!activeTime) return []
    const out: Array<{ name: string; color: string; text: string }> = []
    // Top panel
    for (const s of topSeries) {
      const fmt = s.valueFormat ?? ((s.yAxis ?? 'left') === 'left' ? 'currency' : 'number')
      const y =
        (s.type ?? 'line') === 'bar'
          ? (() => {
              const t = activeTime.getTime()
              const exact = s.points.find((p) => p.x.getTime() === t)
              return exact ? exact.y : null
            })()
          : interpolateAt(s.points, activeTime)
      const text =
        y === null
          ? '—'
          : fmt === 'currency'
            ? formatCurrency(y)
            : `${formatNumber(y)}${s.unit ? ` ${s.unit}` : ''}`
      out.push({ name: s.name, color: s.color, text })
    }
    // Bottom panel
    for (const s of bottomSeries) {
      const y = interpolateAt(s.points, activeTime)
      const text = y === null ? '—' : formatCurrency(y)
      out.push({ name: s.name, color: s.color, text })
    }
    return out
  }, [activeTime, topSeries, bottomSeries])

  const hasData = (topSeries.some((s) => s.points.length) || bottomSeries.some((s) => s.points.length)) && domain

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label="split-chart"
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible', cursor: 'crosshair' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <defs>
        <marker
          id="splitArrowHead"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
        </marker>
      </defs>

      {/* Panel backgrounds */}
      <rect x={PAD.left} y={topY0} width={chartW} height={topH} fill="rgba(255,255,255,0.01)" />
      <rect x={PAD.left} y={bottomY0} width={chartW} height={bottomH} fill="rgba(255,255,255,0.01)" />

      {/* Middle X axis */}
      <line
        x1={PAD.left}
        y1={xAxisY}
        x2={width - PAD.right}
        y2={xAxisY}
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1"
      />

      {/* X labels (single axis) */}
      {xTicks.map((t, i) => (
        <text
          key={`xt-${i}`}
          x={t.x}
          y={xAxisY + 16}
          textAnchor="middle"
          fill="#5c6c7a"
          fontSize="11"
          fontFamily="var(--font-sans)"
        >
          {t.label}
        </text>
      ))}

      {!hasData && (
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="#5c6c7a" fontSize="12">
          No data
        </text>
      )}

      {hasData && (
        <>
          {/* Top Y axis (cost) */}
          <line x1={PAD.left} y1={topY0} x2={PAD.left} y2={topY0 + topH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <text x={15} y={topY0 + topH / 2} textAnchor="middle" fill="#5c6c7a" fontSize="11" transform={`rotate(-90, 15, ${topY0 + topH / 2})`}>
            Cost ($)
          </text>

          {/* Top right axis (inventory) */}
          <line x1={width - PAD.right} y1={topY0} x2={width - PAD.right} y2={topY0 + topH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <text
            x={width - 15}
            y={topY0 + topH / 2}
            textAnchor="middle"
            fill="#5c6c7a"
            fontSize="11"
            transform={`rotate(-90, ${width - 15}, ${topY0 + topH / 2})`}
          >
            Inventory
          </text>

          {/* Bottom Y axis (unit price) */}
          <line x1={PAD.left} y1={bottomY0} x2={PAD.left} y2={bottomY0 + bottomH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          <text
            x={15}
            y={bottomY0 + bottomH / 2}
            textAnchor="middle"
            fill="#5c6c7a"
            fontSize="11"
            transform={`rotate(-90, 15, ${bottomY0 + bottomH / 2})`}
          >
            Unit price ($)
          </text>

          {/* Purchases bars (top) */}
          {topBarSeries.map((s) =>
            s.points.map((p, idx) => {
              const cx = xToPx(p.x)
              const y = topY(p.y, 'left')
              const baseY = topY(0, 'left')
              const h = baseY - y
              const barTopY = h >= 0 ? y : y + h
              return (
                <rect
                  key={`bar-${s.id}-${idx}`}
                  x={cx - barWidth / 2}
                  y={barTopY}
                  width={barWidth}
                  height={Math.abs(h)}
                  fill={s.color}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                  opacity={0.9}
                  rx={3}
                />
              )
            })
          )}

          {/* Inventory line (top, right axis) */}
          {topLineSeries.map((s) => {
            const pts = s.points.slice().sort((a, b) => a.x.getTime() - b.x.getTime())
            if (!pts.length) return null
            let d = `M ${xToPx(pts[0].x)},${topY(pts[0].y, s.yAxis ?? 'left')}`
            for (let i = 1; i < pts.length; i++) {
              d += ` L ${xToPx(pts[i].x)},${topY(pts[i].y, s.yAxis ?? 'left')}`
            }
            return (
              <path
                key={`top-line-${s.id}`}
                d={d}
                fill="none"
                stroke={s.color}
                strokeDasharray={s.dash}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )
          })}

          {/* Price line + points (bottom) */}
          {bottomLineSeries.map((s) => {
            const pts = s.points.slice().sort((a, b) => a.x.getTime() - b.x.getTime())
            if (!pts.length) return null
            let d = `M ${xToPx(pts[0].x)},${bottomY(pts[0].y)}`
            for (let i = 1; i < pts.length; i++) {
              d += ` L ${xToPx(pts[i].x)},${bottomY(pts[i].y)}`
            }
            return (
              <g key={`bottom-${s.id}`}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

                {pts.map((p, i) => {
                  const cx = xToPx(p.x)
                  const cy = bottomY(p.y)
                  const quality = p.strokeColor
                  const stroke = quality ?? s.color
                  const t = p.x.getTime()
                  const match = quality ? costBarTopByTime.get(t) : undefined
                  return (
                    <g key={`p-${s.id}-${i}`}>
                      {quality && match && (
                        <line
                          x1={cx}
                          y1={cy}
                          x2={match.barCenterX}
                          // End at the bottom of the bar (baseline), not the top.
                          y2={match.barBottomY - 2}
                          stroke={quality}
                          strokeWidth={1.5}
                          strokeDasharray="4,4"
                          opacity={0.85}
                          markerEnd="url(#splitArrowHead)"
                        />
                      )}
                      <circle cx={cx} cy={cy} r={3} fill="#0a0e17" stroke={stroke} strokeWidth={2} />
                    </g>
                  )
                })}
              </g>
            )
          })}

          {/* Crosshair + tooltip */}
          {activeX !== null && activeTime !== null && (
            <>
              <line
                x1={activeX}
                y1={topY0}
                x2={activeX}
                y2={bottomY0 + bottomH}
                stroke="rgba(255,255,255,0.28)"
                strokeWidth={1}
                strokeDasharray="4,4"
              />

              <g>
                <rect
                  x={clamp(activeX - 90, PAD.left, width - PAD.right - 180)}
                  y={topY0 + 10}
                  width={180}
                  height={22 + tooltipValues.length * 18}
                  rx={6}
                  fill="#1a2332"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                />
                <text
                  x={clamp(activeX, PAD.left + 90, width - PAD.right - 90)}
                  y={topY0 + 26}
                  textAnchor="middle"
                  fill="#8899a6"
                  fontSize={10}
                >
                  {activeTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </text>
                {tooltipValues.map((v, i) => (
                  <g key={`tv-${i}`}>
                    <circle
                      cx={clamp(activeX - 75, PAD.left + 15, width - PAD.right - 165)}
                      cy={topY0 + 44 + i * 18}
                      r={4}
                      fill={v.color}
                    />
                    <text
                      x={clamp(activeX - 65, PAD.left + 25, width - PAD.right - 155)}
                      y={topY0 + 48 + i * 18}
                      textAnchor="start"
                      fill="#d5dde5"
                      fontSize={11}
                    >
                      {v.name}: {v.text}
                    </text>
                  </g>
                ))}
              </g>
            </>
          )}
        </>
      )}
    </svg>
  )
}


