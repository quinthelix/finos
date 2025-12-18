import { qualityStroke } from '../domain/colors'

export function QualitySpendPie({
  value,
  fair,
  overpay,
}: {
  value: number
  fair: number
  overpay: number
}) {
  const total = value + fair + overpay
  const size = 56
  const pad = 10
  const cx = size / 2
  const cy = size / 2
  const rOuter = 24
  const rInner = 14

  function polarToCartesian(x: number, y: number, radius: number, angleInDegrees: number) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
    return {
      x: x + radius * Math.cos(angleInRadians),
      y: y + radius * Math.sin(angleInRadians),
    }
  }

  function arcPath(startAngle: number, endAngle: number) {
    const start = polarToCartesian(cx, cy, rOuter, endAngle)
    const end = polarToCartesian(cx, cy, rOuter, startAngle)
    const start2 = polarToCartesian(cx, cy, rInner, startAngle)
    const end2 = polarToCartesian(cx, cy, rInner, endAngle)
    const largeArc = endAngle - startAngle <= 180 ? '0' : '1'

    return [
      `M ${start.x} ${start.y}`,
      `A ${rOuter} ${rOuter} 0 ${largeArc} 0 ${end.x} ${end.y}`,
      `L ${start2.x} ${start2.y}`,
      `A ${rInner} ${rInner} 0 ${largeArc} 1 ${end2.x} ${end2.y}`,
      'Z',
    ].join(' ')
  }

  const viewBox = `${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`

  if (total <= 0) {
    return (
      <svg width="100%" height="100%" viewBox={viewBox} aria-label="No purchase quality data">
        <circle cx={cx} cy={cy} r={rOuter} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
        <circle cx={cx} cy={cy} r={rInner} fill="var(--bg-secondary)" />
      </svg>
    )
  }

  const parts = [
    { key: 'value' as const, v: value, color: qualityStroke.value },
    { key: 'fair' as const, v: fair, color: qualityStroke.fair },
    { key: 'overpay' as const, v: overpay, color: qualityStroke.overpay },
  ].filter(
    (p): p is { key: 'value' | 'fair' | 'overpay'; v: number; color: string } => p.v > 0
  )

  let angle = 0
  return (
    <svg width="100%" height="100%" viewBox={viewBox} aria-label="Purchase quality breakdown">
      {parts.map((p) => {
        const ratio = p.v / total
        const sweep = ratio * 360
        const start = angle
        const end = angle + sweep
        const mid = start + sweep / 2
        angle = end

        const pct = Math.round(ratio * 100)
        const showLabel = pct >= 6
        const labelRadius = rOuter + 7
        const labelPos = polarToCartesian(cx, cy, labelRadius, mid)

        return (
          <g key={p.key}>
            <path d={arcPath(start, end)} fill={p.color} stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
            {showLabel && (
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#5c6c7a"
                fontSize="7"
                fontFamily="var(--font-mono, monospace)"
                fontWeight="500"
                style={{ pointerEvents: 'none' }}
              >
                {pct}%
              </text>
            )}
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={rInner} fill="var(--bg-secondary)" />
    </svg>
  )
}


