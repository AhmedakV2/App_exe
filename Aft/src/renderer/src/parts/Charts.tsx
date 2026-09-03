import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'

export interface ChartSeries {
  id: string
  label: string
  color: string
}

export interface ChartBucket {
  key: string
  label: string
  values: number[]
}

export interface TrendPoint {
  key: string
  label: string
  value: number
  hint: string
}

export interface DonutSlice {
  id: string
  label: string
  value: number
  color: string
}

interface BoxSize {
  width: number
  height: number
}

interface Hover {
  index: number
  x: number
  y: number
}

const PAD_TOP = 10
const PAD_RIGHT = 12
const PAD_BOTTOM = 18
const MIN_PLOT = 24
const TIGHT_PLOT = 110
const PAD_LEFT = 42
const TREND_RIGHT = 28
const TIP_FLIP = 86
const DONUT_MIN = 84
const DONUT_MAX = 156
const LEGEND_ROOM = 160
const RING = 14
const BAR_MAX = 24
const GAP = 2
const RADIUS = 4
const SURFACE = 'var(--panel)'
const GRID = 'var(--line)'
const INK = 'var(--faint)'

function useBoxSize(): { ref: (node: HTMLDivElement | null) => void; size: BoxSize } {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 })

  useEffect(() => {
    if (!node) return

    const measure = (): void => {
      const width = Math.round(node.clientWidth)
      const height = Math.round(node.clientHeight)
      setSize((prev) => (prev.width === width && prev.height === height ? prev : { width, height }))
    }

    const observer = new ResizeObserver(measure)
    observer.observe(node)
    measure()

    return () => observer.disconnect()
  }, [node])

  return { ref: setNode, size }
}

function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]

  const raw = max / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((unit) => unit * magnitude).find((size) => size >= raw) ?? raw
  const top = Math.ceil(max / step) * step
  const ticks: number[] = []

  for (let value = 0; value <= top + step / 1000; value += step) ticks.push(value)
  return ticks
}

function columnPath(x: number, y: number, width: number, height: number, round: boolean): string {
  if (height <= 0) return ''
  const r = round ? Math.min(RADIUS, width / 2, height) : 0
  return (
    'M' +
    x +
    ' ' +
    (y + height) +
    'L' +
    x +
    ' ' +
    (y + r) +
    'Q' +
    x +
    ' ' +
    y +
    ' ' +
    (x + r) +
    ' ' +
    y +
    'L' +
    (x + width - r) +
    ' ' +
    y +
    'Q' +
    (x + width) +
    ' ' +
    y +
    ' ' +
    (x + width) +
    ' ' +
    (y + r) +
    'L' +
    (x + width) +
    ' ' +
    (y + height) +
    'Z'
  )
}

function labelStep(count: number, width: number, chars: number, dense: boolean): number {
  const need = chars * 5.2 + (dense ? 10 : 38)
  const room = Math.max(1, Math.floor(width / need))
  return Math.max(1, Math.ceil(count / room))
}

function clampX(x: number, width: number, room: number): number {
  return Math.min(Math.max(x, room), Math.max(room, width - room))
}

function tipBelow(y: number): boolean {
  return y < TIP_FLIP
}

export const Sparkline = memo(function Sparkline({
  values,
  color,
  width = 132,
  height = 34
}: {
  values: number[]
  color: string
  width?: number
  height?: number
}): React.JSX.Element | null {
  if (values.length < 2) return null

  const max = Math.max(...values, 1)
  const stepX = width / (values.length - 1)
  const point = (value: number, index: number): string =>
    index * stepX + ' ' + (height - 3 - (value / max) * (height - 6))

  const line = values.map((value, index) => point(value, index)).join('L')

  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={'M' + line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <path
        d={'M0 ' + height + 'L' + line + 'L' + width + ' ' + height + 'Z'}
        fill={color}
        opacity="0.1"
      />
    </svg>
  )
})

export const StackChart = memo(function StackChart({
  buckets,
  series,
  format,
  cap,
  dense
}: {
  buckets: ChartBucket[]
  series: ChartSeries[]
  format?: (value: number) => string
  cap?: boolean
  dense?: boolean
}): React.JSX.Element {
  const { ref, size } = useBoxSize()
  const [hover, setHover] = useState<Hover | null>(null)
  const clear = useCallback((): void => setHover(null), [])

  const totals = useMemo(
    () => buckets.map((bucket) => bucket.values.reduce((sum, value) => sum + value, 0)),
    [buckets]
  )

  const plotWidth = size.width - PAD_LEFT - PAD_RIGHT
  const plotHeight = size.height - PAD_TOP - PAD_BOTTOM
  const ready = plotWidth > 40 && plotHeight > MIN_PLOT && buckets.length > 0

  const ticks = useMemo(
    () => niceTicks(Math.max(1, ...totals), plotHeight < TIGHT_PLOT ? 2 : 4),
    [plotHeight, totals]
  )
  const top = ticks[ticks.length - 1] || 1
  const band = ready ? plotWidth / buckets.length : 0
  const barWidth = Math.min(BAR_MAX, Math.max(3, band - GAP * 3))
  const baseline = PAD_TOP + plotHeight
  const skip = ready
    ? labelStep(
        buckets.length,
        plotWidth,
        buckets.reduce((long, bucket) => Math.max(long, bucket.label.length), 0),
        Boolean(dense)
      )
    : 1
  const active = hover ? buckets[hover.index] : null

  return (
    <div className="chart" ref={ref} onMouseLeave={clear}>
      {ready ? (
        <svg width={size.width} height={size.height} role="img">
          {ticks.map((tick) => {
            const y = baseline - (tick / top) * plotHeight
            return (
              <g key={tick}>
                <line x1={PAD_LEFT} y1={y} x2={size.width - PAD_RIGHT} y2={y} stroke={GRID} />
                <text className="axis-text" x={PAD_LEFT - 8} y={y + 4} textAnchor="end" fill={INK}>
                  {format ? format(tick) : tick}
                </text>
              </g>
            )
          })}

          {buckets.map((bucket, index) => {
            const left = PAD_LEFT + band * index + (band - barWidth) / 2
            let acc = 0
            let drawn = 0
            const last = bucket.values.reduce((found, value, at) => (value > 0 ? at : found), -1)

            return (
              <g key={bucket.key}>
                {bucket.values.map((value, at) => {
                  if (value <= 0) return null
                  const y = baseline - ((acc + value) / top) * plotHeight
                  const raw = (value / top) * plotHeight
                  const height = drawn > 0 ? raw - GAP : raw
                  acc += value
                  drawn += 1
                  const path = columnPath(left, y, barWidth, height, cap !== false && at === last)
                  return path ? (
                    <path key={series[at]?.id ?? at} d={path} fill={series[at]?.color ?? INK} />
                  ) : null
                })}
              </g>
            )
          })}

          {buckets.map((bucket, index) => {
            if (index % skip !== (buckets.length - 1) % skip) return null
            return (
              <text
                key={bucket.key}
                className="axis-text"
                x={PAD_LEFT + band * index + band / 2}
                y={size.height - 6}
                textAnchor="middle"
                fill={INK}
              >
                {bucket.label}
              </text>
            )
          })}

          {buckets.map((bucket, index) => (
            <rect
              key={bucket.key}
              x={PAD_LEFT + band * index}
              y={PAD_TOP}
              width={band}
              height={plotHeight}
              fill={hover?.index === index ? 'var(--hover)' : 'transparent'}
              opacity={hover?.index === index ? 0.4 : 1}
              onMouseEnter={() =>
                setHover({
                  index,
                  x: PAD_LEFT + band * index + band / 2,
                  y: baseline - (totals[index] / top) * plotHeight
                })
              }
            />
          ))}
        </svg>
      ) : null}

      {hover && active ? (
        <div
          className={'chart-tip' + (tipBelow(hover.y) ? ' below' : '')}
          style={{
            left: clampX(hover.x, size.width, 74),
            top: tipBelow(hover.y) ? hover.y + 14 : hover.y - 10
          }}
        >
          <span className="chart-tip-head">{active.label}</span>
          {series.map((entry, at) => (
            <span key={entry.id} className="chart-tip-row">
              <span className="chart-tip-dot" style={{ background: entry.color }} />
              {entry.label}
              <span className="chart-tip-val">{active.values[at] ?? 0}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
})

export const TrendChart = memo(function TrendChart({
  points,
  color,
  top,
  format
}: {
  points: TrendPoint[]
  color: string
  top: number
  format: (value: number) => string
}): React.JSX.Element {
  const { ref, size } = useBoxSize()
  const [hover, setHover] = useState<Hover | null>(null)
  const clear = useCallback((): void => setHover(null), [])

  const plotWidth = size.width - PAD_LEFT - TREND_RIGHT
  const plotHeight = size.height - PAD_TOP - PAD_BOTTOM
  const ready = plotWidth > 40 && plotHeight > MIN_PLOT && points.length > 1

  const ticks = useMemo(() => niceTicks(top, plotHeight < TIGHT_PLOT ? 2 : 4), [plotHeight, top])
  const ceiling = ticks[ticks.length - 1] || 1
  const baseline = PAD_TOP + plotHeight
  const stepX = ready ? plotWidth / (points.length - 1) : 0
  const skip = ready
    ? labelStep(
        points.length,
        plotWidth,
        points.reduce((long, point) => Math.max(long, point.label.length), 0),
        false
      )
    : 1

  const xOf = (index: number): number => PAD_LEFT + stepX * index
  const yOf = (value: number): number => baseline - (value / ceiling) * plotHeight

  const line = ready
    ? points.map((entry, index) => xOf(index) + ' ' + yOf(entry.value)).join('L')
    : ''
  const end = points[points.length - 1]
  const active = hover ? points[hover.index] : null

  return (
    <div className="chart" ref={ref} onMouseLeave={clear}>
      {ready ? (
        <svg width={size.width} height={size.height} role="img">
          {ticks.map((tick) => {
            const y = yOf(tick)
            return (
              <g key={tick}>
                <line x1={PAD_LEFT} y1={y} x2={size.width - TREND_RIGHT} y2={y} stroke={GRID} />
                <text className="axis-text" x={PAD_LEFT - 8} y={y + 4} textAnchor="end" fill={INK}>
                  {format(tick)}
                </text>
              </g>
            )
          })}

          <path
            d={
              'M' +
              PAD_LEFT +
              ' ' +
              baseline +
              'L' +
              line +
              'L' +
              xOf(points.length - 1) +
              ' ' +
              baseline +
              'Z'
            }
            fill={color}
            opacity="0.1"
          />
          <path
            d={'M' + line}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {points.map((entry, index) => {
            if (index % skip !== (points.length - 1) % skip) return null
            return (
              <text
                key={entry.key}
                className="axis-text"
                x={xOf(index)}
                y={size.height - 6}
                textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
                fill={INK}
              >
                {entry.label}
              </text>
            )
          })}

          {hover ? (
            <line
              x1={xOf(hover.index)}
              y1={PAD_TOP}
              x2={xOf(hover.index)}
              y2={baseline}
              stroke="var(--edge-line)"
            />
          ) : null}

          <circle
            cx={xOf(points.length - 1)}
            cy={yOf(end.value)}
            r="4.5"
            fill={color}
            stroke={SURFACE}
            strokeWidth="2"
          />

          {hover && active ? (
            <circle
              cx={xOf(hover.index)}
              cy={yOf(active.value)}
              r="4.5"
              fill={color}
              stroke={SURFACE}
              strokeWidth="2"
            />
          ) : null}

          {points.map((entry, index) => (
            <rect
              key={entry.key}
              x={xOf(index) - stepX / 2}
              y={PAD_TOP}
              width={stepX}
              height={plotHeight}
              fill="transparent"
              onMouseEnter={() => setHover({ index, x: xOf(index), y: yOf(entry.value) })}
            />
          ))}
        </svg>
      ) : null}

      {ready && !hover ? (
        <span
          className="chart-endnote"
          style={{
            left: clampX(xOf(points.length - 1), size.width, 26),
            top: yOf(end.value) - 26
          }}
        >
          {format(end.value)}
        </span>
      ) : null}

      {hover && active ? (
        <div
          className={'chart-tip' + (tipBelow(hover.y) ? ' below' : '')}
          style={{
            left: clampX(hover.x, size.width, 74),
            top: tipBelow(hover.y) ? hover.y + 14 : hover.y - 10
          }}
        >
          <span className="chart-tip-head">{active.label}</span>
          <span className="chart-tip-row">
            <span className="chart-tip-dot" style={{ background: color }} />
            {active.hint}
            <span className="chart-tip-val">{format(active.value)}</span>
          </span>
        </div>
      ) : null}
    </div>
  )
})

export const DonutChart = memo(function DonutChart({
  slices,
  caption
}: {
  slices: DonutSlice[]
  caption: string
}): React.JSX.Element {
  const { ref, size } = useBoxSize()
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  const box = Math.round(
    Math.min(DONUT_MAX, Math.max(DONUT_MIN, Math.min(size.height, size.width - LEGEND_ROOM)))
  )
  const ready = size.width > 0 && size.height > 0
  const radius = box / 2 - RING / 2 - 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="donut-wrap" ref={ref}>
      {ready ? (
        <div className="donut" style={{ width: box, height: box }}>
          <svg width={box} height={box} role="img">
            <circle
              cx={box / 2}
              cy={box / 2}
              r={radius}
              fill="none"
              stroke={GRID}
              strokeWidth={RING}
            />
            {total
              ? slices.map((slice) => {
                  if (slice.value <= 0) return null
                  const length = (slice.value / total) * circumference
                  const dash = Math.max(1, length - GAP * 2)
                  const node = (
                    <circle
                      key={slice.id}
                      cx={box / 2}
                      cy={box / 2}
                      r={radius}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth={RING}
                      strokeDasharray={dash + ' ' + (circumference - dash)}
                      strokeDashoffset={-offset}
                      transform={'rotate(-90 ' + box / 2 + ' ' + box / 2 + ')'}
                    />
                  )
                  offset += length
                  return node
                })
              : null}
          </svg>
          <span className="donut-mid">
            <span className="donut-value">{total}</span>
            <span className="donut-note">{caption}</span>
          </span>
        </div>
      ) : null}

      <div className="chart-legend column">
        {slices.map((slice) => (
          <span key={slice.id} className="legend-item">
            <span className="legend-key" style={{ background: slice.color }} />
            {slice.label}
            <span className="legend-val">
              {slice.value} · %{total ? Math.round((slice.value / total) * 100) : 0}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
})

export const Legend = memo(function Legend({
  series
}: {
  series: ChartSeries[]
}): React.JSX.Element {
  return (
    <div className="chart-legend">
      {series.map((entry) => (
        <span key={entry.id} className="legend-item">
          <span className="legend-key" style={{ background: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  )
})
