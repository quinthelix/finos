import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LineChart } from './LineChart'
import type { Series } from './LineChart'

type XDomain = { min: Date; max: Date }

type Arrow = { x1: number; y1: number; x2: number; y2: number; color: string }

type Props = {
  topSeries: Series[]
  bottomSeries: Series[]
  xDomain?: XDomain
  pinnedX?: Date | null
  topHeight?: number
  bottomHeight?: number
}

function weekKeyFromMs(ms: number): string {
  const d = new Date(ms)
  // ISO-ish week start: Monday 00:00 UTC
  const day = d.getUTCDay() // 0..6 (Sun..Sat)
  const diff = (day + 6) % 7 // 0 for Mon, 6 for Sun
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
  start.setUTCDate(start.getUTCDate() - diff)
  return start.toISOString().slice(0, 10)
}

export function SplitChart({
  topSeries,
  bottomSeries,
  xDomain,
  pinnedX,
  topHeight = 320,
  bottomHeight = 130,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const [arrows, setArrows] = useState<Arrow[]>([])

  const sizes = useMemo(() => ({ topHeight, bottomHeight }), [topHeight, bottomHeight])

  const computeArrows = () => {
    const container = containerRef.current
    const top = topRef.current
    const bottom = bottomRef.current
    if (!container || !top || !bottom) return

    const containerRect = container.getBoundingClientRect()
    const barRects = Array.from(top.querySelectorAll<SVGRectElement>('rect[data-kind="bar"][data-x]'))
    const dotCircles = Array.from(
      bottom.querySelectorAll<SVGCircleElement>('circle[data-kind="dot"][data-quality="1"][data-x]')
    )

    // Map purchase bars by week key -> bar baseline point (center x, bottom y)
    const barByWeek = new Map<string, { x: number; y: number }>()
    for (const r of barRects) {
      const xAttr = r.getAttribute('data-x')
      if (!xAttr) continue
      const wk = weekKeyFromMs(Number(xAttr))
      const rect = r.getBoundingClientRect()
      const x = rect.left + rect.width / 2 - containerRect.left
      const y = rect.bottom - containerRect.top // baseline == bottom of bar
      barByWeek.set(wk, { x, y })
    }

    const next: Arrow[] = []
    for (const c of dotCircles) {
      const xAttr = c.getAttribute('data-x')
      if (!xAttr) continue
      const wk = weekKeyFromMs(Number(xAttr))
      const target = barByWeek.get(wk)
      if (!target) continue

      const color = c.getAttribute('data-stroke') || ''
      if (!color || color === 'none') continue

      const rect = c.getBoundingClientRect()
      const x1 = rect.left + rect.width / 2 - containerRect.left
      const y1 = rect.top + rect.height / 2 - containerRect.top

      // Keep it subtle: stop a few pixels shy of the bar baseline.
      const y2 = target.y - 4

      next.push({ x1, y1, x2: target.x, y2, color })
    }

    setArrows(next)
  }

  useLayoutEffect(() => {
    // Initial compute (may be empty while LineChart is animating).
    computeArrows()
  }, [topSeries, bottomSeries, xDomain, pinnedX, sizes])

  useEffect(() => {
    // Recompute once the LineChart animation is likely done and dots are present.
    const t1 = setTimeout(() => computeArrows(), 250)
    const t2 = setTimeout(() => computeArrows(), 900)
    const t3 = setTimeout(() => computeArrows(), 1700)

    const top = topRef.current
    const bottom = bottomRef.current
    if (!top || !bottom) return () => {
      clearTimeout(t1); clearTimeout(t2); clearTimeout(t3)
    }

    const mo = new MutationObserver(() => computeArrows())
    mo.observe(top, { subtree: true, childList: true, attributes: true })
    mo.observe(bottom, { subtree: true, childList: true, attributes: true })

    const ro = new ResizeObserver(() => computeArrows())
    ro.observe(top)
    ro.observe(bottom)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
      mo.disconnect()
      ro.disconnect()
    }
  }, [topSeries, bottomSeries, xDomain, pinnedX, sizes])

  return (
    <div className="charts-pair" ref={containerRef}>
      <div className="charts-pair-top" ref={topRef}>
        <LineChart series={topSeries} height={topHeight} pinnedX={pinnedX} minYZero hideAreas xDomain={xDomain} />
      </div>
      <div className="charts-pair-bottom" ref={bottomRef}>
        <LineChart
          series={bottomSeries}
          height={bottomHeight}
          pinnedX={pinnedX}
          hideAreas
          xDomain={xDomain}
          showXAxis={false}
          yAxisTitle="Unit price ($)"
        />
      </div>

      <svg className="charts-pair-overlay" aria-hidden="true">
        <defs>
          <marker
            id="splitArrowHead"
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
          >
            {/* Use the line's stroke color for the arrowhead */}
            <path d="M0,0 L7,3.5 L0,7 Z" fill="context-stroke" stroke="context-stroke" />
          </marker>
        </defs>
        {arrows.map((a, i) => (
          <line
            key={`a-${i}`}
            x1={a.x1}
            y1={a.y1}
            x2={a.x2}
            y2={a.y2}
            stroke={a.color}
            strokeWidth={1.5}
            strokeDasharray="4,4"
            opacity={0.9}
            markerEnd="url(#splitArrowHead)"
          />
        ))}
      </svg>
    </div>
  )
}


