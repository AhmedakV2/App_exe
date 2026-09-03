import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { FragileStep, HealthSummary, RunRow } from '../../../main/data'
import { Glyph, IconButton } from '../icons'
import { Bar, Card, Empty, Metric, PageHead, Pill, Segmented } from '../ui'
import { DonutChart, Legend, Sparkline, StackChart, TrendChart } from '../parts/Charts'
import type { ChartBucket, ChartSeries, DonutSlice, TrendPoint } from '../parts/Charts'
import { formatMs, formatShortDate, percent, ratio } from '../format'
import type { Report } from '../report'

const RUN_LIMIT = 500
const DAY = 24 * 60 * 60 * 1000

const RANGES = [
  { id: '7', label: '7 gün' },
  { id: '30', label: '30 gün' },
  { id: '90', label: '90 gün' },
  { id: 'all', label: 'Tümü' }
]

const VIEWS = [
  { id: 'chart', label: 'Grafik' },
  { id: 'table', label: 'Tablo' }
]

const RUN_SERIES: ChartSeries[] = [
  { id: 'passed', label: 'başarılı', color: 'var(--ok)' },
  { id: 'failed', label: 'başarısız', color: 'var(--bad)' }
]

const SPAN_SERIES: ChartSeries[] = [{ id: 'runs', label: 'koşum', color: 'var(--accent)' }]

const STATUS_META: { id: string; label: string; color: string }[] = [
  { id: 'passed', label: 'başarılı', color: 'var(--ok)' },
  { id: 'failed', label: 'başarısız', color: 'var(--bad)' },
  { id: 'errored', label: 'hata', color: 'var(--warn)' },
  { id: 'aborted', label: 'iptal', color: 'var(--faint)' }
]

const SPANS = [
  { key: 'a', label: '< 1 sn', limit: 1000 },
  { key: 'b', label: '1-5 sn', limit: 5000 },
  { key: 'c', label: '5-15 sn', limit: 15000 },
  { key: 'd', label: '15-60 sn', limit: 60000 },
  { key: 'e', label: '60 sn +', limit: Number.POSITIVE_INFINITY }
]

interface Slot {
  key: string
  label: string
  from: number
  to: number
  passed: number
  failed: number
}

interface ScenarioStat {
  id: string
  title: string
  runs: number
  passed: number
  meanMs: number
  lastAt: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// Gün başlangıcına iner, kova sınırlarını gün ızgarasına oturtur.
function startOfDay(at: number): number {
  const value = new Date(at)
  value.setHours(0, 0, 0, 0)
  return value.getTime()
}

// Pazartesiyi haftanın ilk günü sayarak hafta başlangıcını verir.
function startOfWeek(at: number): number {
  const value = new Date(startOfDay(at))
  const shift = (value.getDay() + 6) % 7
  value.setDate(value.getDate() - shift)
  return value.getTime()
}

// Seçili aralığı gün ya da hafta kovalarına böler.
function buildSlots(from: number, to: number, weekly: boolean): Slot[] {
  const slots: Slot[] = []
  let cursor = weekly ? startOfWeek(from) : startOfDay(from)
  let guard = 0

  while (cursor <= to && guard < 400) {
    const next = weekly ? cursor + 7 * DAY : cursor + DAY
    const at = new Date(cursor)
    slots.push({
      key: String(cursor),
      label: pad(at.getDate()) + '.' + pad(at.getMonth() + 1),
      from: cursor,
      to: next,
      passed: 0,
      failed: 0
    })
    cursor = next
    guard += 1
  }

  return slots
}

function signed(value: number): string {
  const text = Math.abs(value).toFixed(1).replace('.', ',')
  return (value >= 0 ? '+' : '−') + text
}

export default function StatsPage({
  revision,
  onReport
}: {
  revision: number
  onReport: (report: Report) => void
}): React.JSX.Element {
  const [runs, setRuns] = useState<RunRow[]>([])
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [fragile, setFragile] = useState<FragileStep[]>([])
  const [range, setRange] = useState('30')
  const [volumeView, setVolumeView] = useState('chart')
  const [trendView, setTrendView] = useState('chart')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(0)

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    setNow(Date.now())
    try {
      const [list, health] = await Promise.all([
        window.aftData.runs({ limit: RUN_LIMIT, offset: 0 }),
        window.aftData.health()
      ])

      if (list.ok && list.data) setRuns(list.data.rows)
      else onReport({ level: 'err', text: 'Koşum listesi alınamadı: ' + list.message })

      if (health.ok && health.data) {
        setSummary(health.data.summary)
        setFragile(health.data.fragile)
      }
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
    }
  }, [onReport])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, revision])

  const frame = useMemo(() => {
    if (range === 'all') {
      const oldest = runs.reduce(
        (low, run) => (run.startedAt && run.startedAt < low ? run.startedAt : low),
        now
      )
      return { from: oldest, to: now, days: Math.max(1, Math.round((now - oldest) / DAY)) }
    }
    const days = Number(range)
    return { from: now - days * DAY, to: now, days }
  }, [now, range, runs])

  const scoped = useMemo(
    () => runs.filter((run) => run.startedAt >= frame.from && run.startedAt <= frame.to),
    [runs, frame]
  )

  const previous = useMemo(() => {
    const span = frame.to - frame.from
    const from = frame.from - span
    return runs.filter((run) => run.startedAt >= from && run.startedAt < frame.from)
  }, [runs, frame])

  const totals = useMemo(() => {
    const passed = scoped.filter((run) => run.ok).length
    const steps = scoped.reduce((sum, run) => sum + run.steps, 0)
    const failedSteps = scoped.reduce((sum, run) => sum + run.failed, 0)
    const totalMs = scoped.reduce((sum, run) => sum + run.totalMs, 0)
    const confidence = scoped.reduce((sum, run) => sum + run.meanConfidence, 0)
    const scenarios = new Set(scoped.map((run) => run.scenarioId)).size
    const lastAt = scoped.reduce((high, run) => Math.max(high, run.startedAt), 0)

    return {
      runs: scoped.length,
      passed,
      failed: scoped.length - passed,
      rate: ratio(passed, scoped.length),
      steps,
      failedSteps,
      meanMs: scoped.length ? totalMs / scoped.length : 0,
      meanConfidence: scoped.length ? confidence / scoped.length : 0,
      scenarios,
      lastAt
    }
  }, [scoped])

  const delta = useMemo(() => {
    if (range === 'all' || !previous.length || !scoped.length) return null
    const before = ratio(previous.filter((run) => run.ok).length, previous.length)
    return (totals.rate - before) * 100
  }, [previous, range, scoped.length, totals.rate])

  const slots = useMemo(() => {
    const weekly = frame.days > 45
    const list = buildSlots(frame.from, frame.to, weekly)
    if (!list.length) return list

    for (const run of scoped) {
      const slot = list.find((entry) => run.startedAt >= entry.from && run.startedAt < entry.to)
      if (!slot) continue
      if (run.ok) slot.passed += 1
      else slot.failed += 1
    }

    return list
  }, [scoped, frame])

  const volume = useMemo<ChartBucket[]>(
    () =>
      slots.map((slot) => ({
        key: slot.key,
        label: slot.label,
        values: [slot.passed, slot.failed]
      })),
    [slots]
  )

  const trend = useMemo<TrendPoint[]>(
    () =>
      slots
        .filter((slot) => slot.passed + slot.failed > 0)
        .map((slot) => ({
          key: slot.key,
          label: slot.label,
          value: ratio(slot.passed, slot.passed + slot.failed) * 100,
          hint: slot.passed + '/' + (slot.passed + slot.failed) + ' koşum'
        })),
    [slots]
  )

  const spark = useMemo(() => trend.slice(-12).map((point) => point.value), [trend])

  const statuses = useMemo<DonutSlice[]>(
    () =>
      STATUS_META.map((entry) => ({
        id: entry.id,
        label: entry.label,
        color: entry.color,
        value: scoped.filter((run) => run.status === entry.id).length
      })),
    [scoped]
  )

  const spans = useMemo<ChartBucket[]>(() => {
    const counts = SPANS.map(() => 0)
    for (const run of scoped) {
      const at = SPANS.findIndex((span) => run.totalMs < span.limit)
      counts[at < 0 ? SPANS.length - 1 : at] += 1
    }
    return SPANS.map((span, at) => ({ key: span.key, label: span.label, values: [counts[at]] }))
  }, [scoped])

  const scenarios = useMemo<ScenarioStat[]>(() => {
    const map = new Map<string, ScenarioStat & { totalMs: number }>()

    for (const run of scoped) {
      const entry = map.get(run.scenarioId) ?? {
        id: run.scenarioId,
        title: run.scenarioTitle,
        runs: 0,
        passed: 0,
        meanMs: 0,
        lastAt: 0,
        totalMs: 0
      }
      entry.runs += 1
      entry.passed += run.ok ? 1 : 0
      entry.totalMs += run.totalMs
      entry.lastAt = Math.max(entry.lastAt, run.startedAt)
      map.set(run.scenarioId, entry)
    }

    return [...map.values()]
      .map((entry) => ({ ...entry, meanMs: entry.runs ? entry.totalMs / entry.runs : 0 }))
      .sort((a, b) => ratio(a.passed, a.runs) - ratio(b.passed, b.runs) || b.runs - a.runs)
  }, [scoped])

  const empty = Boolean(now) && !runs.length

  return (
    <div className="page">
      <PageHead
        title="İstatistik"
        meta={
          <>
            <Pill tone={totals.runs ? 'accent' : 'flat'}>{totals.runs} koşum</Pill>
            <Pill>{totals.scenarios} senaryo</Pill>
            {totals.lastAt ? <Pill>son {formatShortDate(totals.lastAt)}</Pill> : null}
            {fragile.length ? <Pill tone="warn">{fragile.length} kırılgan</Pill> : null}
          </>
        }
        actions={
          <>
            <Segmented items={RANGES} value={range} onPick={setRange} disabled={busy} />
            <IconButton
              name="reload"
              title="Yenile"
              onClick={() => void load()}
              disabled={busy}
              small
            />
          </>
        }
      />

      {!now ? null : empty ? (
        <Card label="Özet" grow>
          <Empty glyph="spark" text="Henüz koşum kaydı yok" />
        </Card>
      ) : (
        <div className={'stat-flow' + (busy ? ' busy' : '')}>
          <div className="stat-band">
            <div className="stat-hero">
              <span className="hero-label">başarı oranı</span>
              <span className="hero-value">{percent(totals.rate)}</span>
              <div className="hero-foot">
                {delta === null ? (
                  <span className="hero-note">önceki dönem yok</span>
                ) : (
                  <>
                    <span className={'hero-delta ' + (delta >= 0 ? 'up' : 'down')}>
                      {signed(delta)} puan
                    </span>
                    <span className="hero-note">önceki {frame.days} güne göre</span>
                  </>
                )}
              </div>
              <Sparkline values={spark} color="var(--accent)" />
            </div>

            <div className="metric-row wide">
              <Metric label="koşum" value={totals.runs} />
              <Metric label="başarılı" value={totals.passed} tone="ok" />
              <Metric
                label="başarısız"
                value={totals.failed}
                tone={totals.failed ? 'bad' : 'flat'}
              />
              <Metric label="adım" value={totals.steps} />
              <Metric
                label="kalan adım"
                value={totals.failedSteps}
                tone={totals.failedSteps ? 'warn' : 'flat'}
              />
              <Metric label="ort. süre" value={formatMs(totals.meanMs)} />
              <Metric label="ort. güven" value={percent(totals.meanConfidence)} tone="accent" />
              <Metric
                label="onarım"
                value={summary?.healed ?? 0}
                tone={summary?.healed ? 'warn' : 'flat'}
              />
            </div>
          </div>

          <div className="stat-row tall">
            <Card
              label="Koşum hacmi"
              grow
              actions={<Segmented items={VIEWS} value={volumeView} onPick={setVolumeView} />}
            >
              {volumeView === 'chart' ? (
                <>
                  <StackChart buckets={volume} series={RUN_SERIES} />
                  <Legend series={RUN_SERIES} />
                </>
              ) : (
                <div className="table scroll-y">
                  <div className="tr th">
                    <span className="td grow">dönem</span>
                    <span className="td num">başarılı</span>
                    <span className="td num">başarısız</span>
                    <span className="td num">oran</span>
                  </div>
                  {slots.map((slot) => (
                    <div key={slot.key} className="tr">
                      <span className="td grow">{slot.label}</span>
                      <span className="td num ok">{slot.passed}</span>
                      <span className="td num bad">{slot.failed}</span>
                      <span className="td num dim">
                        {slot.passed + slot.failed
                          ? percent(ratio(slot.passed, slot.passed + slot.failed))
                          : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card label="Durum dağılımı" side>
              <DonutChart slices={statuses} caption="koşum" />
            </Card>
          </div>

          <div className="stat-row tall">
            <Card
              label="Başarı oranı eğilimi"
              grow
              actions={<Segmented items={VIEWS} value={trendView} onPick={setTrendView} />}
            >
              {trend.length > 1 && trendView === 'chart' ? (
                <TrendChart
                  points={trend}
                  color="var(--accent)"
                  top={100}
                  format={(value) => '%' + Math.round(value)}
                />
              ) : trend.length ? (
                <div className="table scroll-y">
                  <div className="tr th">
                    <span className="td grow">dönem</span>
                    <span className="td">koşum</span>
                    <span className="td num">oran</span>
                  </div>
                  {trend.map((point) => (
                    <div key={point.key} className="tr">
                      <span className="td grow">{point.label}</span>
                      <span className="td dim">{point.hint}</span>
                      <span className="td num">%{Math.round(point.value)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty glyph="pulse" text="Bu aralıkta koşum yok" />
              )}
            </Card>

            <Card label="Süre dağılımı" side>
              <StackChart buckets={spans} series={SPAN_SERIES} />
            </Card>
          </div>

          <div className="stat-row tall">
            <Card label="Senaryo başarımı" grow scroll>
              {scenarios.length ? (
                <div className="table">
                  <div className="tr th">
                    <span className="td grow">senaryo</span>
                    <span className="td wide">başarı</span>
                    <span className="td num">koşum</span>
                    <span className="td date">ort. süre</span>
                    <span className="td date">son</span>
                  </div>
                  {scenarios.map((entry) => {
                    const rate = ratio(entry.passed, entry.runs)
                    return (
                      <div key={entry.id} className="tr">
                        <span className="td grow">{entry.title}</span>
                        <span className="td wide">
                          <Bar
                            value={rate}
                            tone={rate >= 0.9 ? 'ok' : rate >= 0.6 ? 'warn' : 'bad'}
                          />
                          {percent(rate)}
                        </span>
                        <span className="td num dim">{entry.runs}</span>
                        <span className="td date dim">{formatMs(entry.meanMs)}</span>
                        <span className="td date dim">{formatShortDate(entry.lastAt)}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <Empty glyph="library" text="Bu aralıkta senaryo koşumu yok" />
              )}
            </Card>

            <Card label="Kırılgan adımlar" side scroll>
              {fragile.length ? (
                <div className="table">
                  <div className="tr th">
                    <span className="td grow">adım</span>
                    <span className="td num">deneme</span>
                    <span className="td">güven</span>
                  </div>
                  {fragile.slice(0, 20).map((step) => (
                    <div key={step.descriptorId} className="tr">
                      <span className="td grow">{step.title || step.descriptorId}</span>
                      <span className="td num dim">{step.attempts}</span>
                      <span className="td">
                        <Pill tone={step.meanConfidence >= 0.8 ? 'ok' : 'warn'}>
                          {percent(step.meanConfidence)}
                        </Pill>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="center">
                  <span className="hero-note">
                    <Glyph name="check" size={13} /> Kırılgan adım yok
                  </span>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
