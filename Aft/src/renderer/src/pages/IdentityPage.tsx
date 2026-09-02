import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { FragileStep, HealthSummary } from '../../../main/data'
import type {
  Descriptor,
  DescriptorSummary,
  HealingProposal,
  StrategyStat
} from '../../../main/identity'
import type { ValidationReport } from '../../../main/model'
import { Glyph } from '../icons'
import { Bar, Empty, Metric, Pill, Segmented, Sym, TextButton } from '../ui'
import { formatShortDate, percent, ratio } from '../format'
import type { Report } from '../report'

type Tab = 'approvals' | 'fragile' | 'catalog' | 'strategies'

const TABS: { id: Tab; label: string }[] = [
  { id: 'approvals', label: 'Onay' },
  { id: 'fragile', label: 'Kırılgan' },
  { id: 'catalog', label: 'Katalog' },
  { id: 'strategies', label: 'Strateji' }
]

const TIER_TONE: Record<string, 'ok' | 'warn' | 'bad'> = { strong: 'ok', fair: 'warn', weak: 'bad' }

const DECISION_TONE: Record<string, 'ok' | 'warn' | 'bad'> = {
  auto: 'ok',
  approval: 'warn',
  blocked: 'bad'
}

function isTab(value: string): value is Tab {
  return TABS.some((item) => item.id === value)
}

function strategyLines(
  descriptor: Descriptor,
  other: Descriptor
): { kind: string; value: string; weight: number; state: string }[] {
  return descriptor.strategies.map((entry) => {
    const twin = other.strategies.find((item) => item.kind === entry.kind)
    const state = !twin
      ? 'only'
      : twin.value !== entry.value || twin.weight !== entry.weight
        ? 'chg'
        : ''
    return { kind: entry.kind, value: entry.value, weight: entry.weight, state }
  })
}

export default function IdentityPage({
  revision,
  initialTab,
  onReport
}: {
  revision: number
  initialTab: string
  onReport: (report: Report) => void
}): React.JSX.Element {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [fragile, setFragile] = useState<FragileStep[]>([])
  const [catalog, setCatalog] = useState<DescriptorSummary[]>([])
  const [approvals, setApprovals] = useState<HealingProposal[]>([])
  const [strategies, setStrategies] = useState<Record<string, StrategyStat>>({})
  const [scope, setScope] = useState('')
  const [validation, setValidation] = useState<ValidationReport | null>(null)
  const [tab, setTab] = useState<Tab>(isTab(initialTab) ? initialTab : 'approvals')
  const [picked, setPicked] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const [seenTab, setSeenTab] = useState(initialTab)
  if (initialTab !== seenTab) {
    setSeenTab(initialTab)
    if (isTab(initialTab)) setTab(initialTab)
  }

  const load = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const [health, list, pending] = await Promise.all([
        window.aftData.health(),
        window.aftIdentity.list(),
        window.aftIdentity.approvals()
      ])
      if (health.ok && health.data) {
        setSummary(health.data.summary)
        setFragile(health.data.fragile)
      }
      if (pending.ok && pending.data) setApprovals(pending.data)
      if (list.ok && list.data) {
        setCatalog(list.data)
        const first = list.data[0]
        if (first) {
          const stats = await window.aftIdentity.stats(first.id)
          if (stats.ok && stats.data) {
            setStrategies(stats.data.strategies)
            setScope(stats.data.scope)
          }
        }
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

  const validate = useCallback(async (): Promise<void> => {
    const result = await window.aftIdentity.validate()
    if (!result.ok || !result.data) {
      onReport({ level: 'err', text: 'Model doğrulanamadı: ' + result.message })
      return
    }
    setValidation(result.data)
    onReport({
      level: result.data.ok ? 'ok' : 'err',
      text: 'Model doğrulaması: ' + result.data.checked + ' düğüm',
      detail: result.data.errors.slice(0, 4).map((issue) => issue.code + ': ' + issue.detail)
    })
  }, [onReport])

  const approve = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.approve(id)
      onReport({
        level: result.ok ? 'ok' : 'err',
        text: result.ok ? 'Onarım onaylandı' : 'Onaylanamadı: ' + result.message
      })
      await load()
    },
    [load, onReport]
  )

  const reject = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.reject(id)
      onReport({
        level: result.ok ? 'note' : 'err',
        text: result.ok ? 'Onarım reddedildi' : 'Reddedilemedi: ' + result.message
      })
      await load()
    },
    [load, onReport]
  )

  const drop = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.remove(id)
      onReport({
        level: result.ok ? 'note' : 'err',
        text: result.ok ? 'Descriptor silindi' : 'Silinemedi: ' + result.message
      })
      await load()
    },
    [load, onReport]
  )

  const inspect = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.stats(id)
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'İstatistik okunamadı: ' + result.message })
        return
      }
      setStrategies(result.data.strategies)
      setScope(result.data.scope)
      setTab('strategies')
    },
    [onReport]
  )

  const rows = useMemo(() => {
    const text = filter.trim().toLowerCase()
    if (!text) return catalog
    return catalog.filter(
      (entry) =>
        entry.name.toLowerCase().includes(text) ||
        entry.role.toLowerCase().includes(text) ||
        entry.tag.toLowerCase().includes(text) ||
        entry.urlPattern.toLowerCase().includes(text)
    )
  }, [catalog, filter])

  const strategyRows = useMemo(
    () =>
      Object.entries(strategies)
        .map(([kind, stat]) => ({ kind, stat }))
        .sort((a, b) => b.stat.attempts - a.stat.attempts),
    [strategies]
  )

  const tiers = useMemo(() => {
    const count = { strong: 0, fair: 0, weak: 0 }
    for (const entry of catalog) count[entry.tier] += 1
    return count
  }, [catalog])

  const proposal = useMemo(
    () => approvals.find((entry) => entry.descriptorId === picked) ?? approvals[0] ?? null,
    [approvals, picked]
  )

  const before = proposal ? strategyLines(proposal.previous, proposal.next) : []
  const after = proposal ? strategyLines(proposal.next, proposal.previous) : []
  const total = catalog.length || 1

  return (
    <>
      <header className="hdr">
        <Glyph name="pulse" size={14} />
        <Segmented
          items={TABS.map((item) => ({
            id: item.id,
            label:
              item.label +
              (item.id === 'approvals' && approvals.length ? ' ' + approvals.length : '') +
              (item.id === 'fragile' && fragile.length ? ' ' + fragile.length : '') +
              (item.id === 'catalog' ? ' ' + catalog.length : '')
          }))}
          value={tab}
          onPick={(id) => setTab(id as Tab)}
        />
        <span className="push" />
        <span className="faint">Katalog sağlığı</span>
        <span
          style={{ display: 'flex', width: 160, height: 5, borderRadius: 2, overflow: 'hidden' }}
        >
          <i style={{ width: (tiers.strong / total) * 100 + '%', background: 'var(--ok)' }} />
          <i style={{ width: (tiers.fair / total) * 100 + '%', background: 'var(--warn)' }} />
          <i style={{ width: (tiers.weak / total) * 100 + '%', background: 'var(--bad)' }} />
        </span>
        <span className="mono faint">
          {percent(tiers.strong / total)} · {percent(tiers.fair / total)} ·{' '}
          {percent(tiers.weak / total)}
        </span>
        {validation ? (
          <Pill tone={validation.ok ? 'ok' : 'bad'}>model {validation.checked}</Pill>
        ) : null}
        <TextButton
          glyph="shield"
          label="Modeli doğrula"
          onClick={() => void validate()}
          disabled={busy}
        />
        <button
          className="ib"
          title="Yenile"
          onClick={() => void load()}
          disabled={busy}
          type="button"
        >
          <Glyph name="reload" size={13} />
        </button>
      </header>

      <div className="metrics">
        <Metric label="Koşum" value={summary?.runs ?? 0} />
        <Metric label="Adım" value={summary?.steps ?? 0} />
        <Metric label="Kesin" value={summary?.resolved ?? 0} tone="ok" />
        <Metric
          label="Düşük güven"
          value={summary?.low ?? 0}
          tone={summary?.low ? 'warn' : 'flat'}
        />
        <Metric
          label="Bulunamayan"
          value={summary?.missing ?? 0}
          tone={summary?.missing ? 'bad' : 'flat'}
        />
        <Metric
          label="Onarılan"
          value={summary?.healed ?? 0}
          tone={summary?.healed ? 'accent' : 'flat'}
        />
        <Metric label="Ort. güven" value={percent(summary?.meanConfidence ?? 0)} />
        <Metric label="Son koşum" value={formatShortDate(summary?.lastRunAt ?? 0)} />
      </div>

      {tab === 'approvals' ? (
        <div className="split" style={{ gridTemplateColumns: '300px 1fr' }}>
          <div className="col scroll">
            <div className="ph">
              Bekleyen öneriler
              <span className="push" />
              {approvals.length ? <Pill tone="warn">{approvals.length}</Pill> : null}
            </div>
            {approvals.length ? (
              <div className="list-rows">
                {approvals.map((entry) => (
                  <button
                    key={entry.descriptorId}
                    className={
                      'list-row' + (proposal?.descriptorId === entry.descriptorId ? ' sel' : '')
                    }
                    onClick={() => setPicked(entry.descriptorId)}
                    type="button"
                  >
                    <Sym tone={DECISION_TONE[entry.decision] ?? 'flat'} />
                    <span className="list-title">
                      {entry.next.target.name || entry.next.target.tag}
                    </span>
                    <span className="list-meta">{percent(entry.confidence)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty glyph="shield" text="Bekleyen onay yok" />
            )}
          </div>

          <div className="col">
            {proposal ? (
              <>
                <header className="hdr">
                  <Sym tone={DECISION_TONE[proposal.decision] ?? 'flat'} />
                  <span className="t">{proposal.next.target.name || proposal.next.target.tag}</span>
                  <Pill tone={DECISION_TONE[proposal.decision] ?? 'flat'}>{proposal.decision}</Pill>
                  <span className="chip">{proposal.descriptorId}</span>
                  <span className="mono faint">{formatShortDate(proposal.createdAt)}</span>
                  <span className="push" />
                  <TextButton
                    glyph="close"
                    label="Reddet"
                    onClick={() => void reject(proposal.descriptorId)}
                    tone="danger"
                  />
                  <TextButton
                    glyph="check"
                    label="Onayla"
                    onClick={() => void approve(proposal.descriptorId)}
                    tone="primary"
                  />
                </header>
                <div className="diff">
                  <div className="dcol">
                    <div className="dh">
                      MEVCUT
                      <span className="mono">{proposal.previous.quality.tier}</span>
                      <span className="faint">{percent(proposal.previous.quality.score)}</span>
                      <span className="push" />
                      <span className="faint">
                        {formatShortDate(proposal.previous.capture.capturedAt)}
                      </span>
                    </div>
                    <div className="code">
                      {before.map((line, index) => (
                        <div
                          key={line.kind}
                          className={
                            'ln' +
                            (line.state === 'only' ? ' del' : line.state === 'chg' ? ' chg' : '')
                          }
                        >
                          <span className="g">{index + 1}</span>
                          <span className="c">
                            <span className="k">{line.kind.padEnd(16, ' ')}</span>
                            <span className="s">{line.value}</span>{' '}
                            <span className="n">{line.weight.toFixed(2)}</span>
                          </span>
                        </div>
                      ))}
                      <div className="ln">
                        <span className="g" />
                        <span className="c faint">
                          {proposal.previous.quality.reasons.join(' · ') || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="dcol">
                    <div className="dh">
                      ÖNERİ
                      <span className="mono">{proposal.next.quality.tier}</span>
                      <span className="faint">{percent(proposal.next.quality.score)}</span>
                      <span className="push" />
                      {proposal.gained.length ? (
                        <Pill tone="ok">+{proposal.gained.length}</Pill>
                      ) : null}
                      {proposal.lost.length ? (
                        <Pill tone="bad">−{proposal.lost.length}</Pill>
                      ) : null}
                    </div>
                    <div className="code">
                      {after.map((line, index) => (
                        <div
                          key={line.kind}
                          className={
                            'ln' +
                            (line.state === 'only' ? ' add' : line.state === 'chg' ? ' chg' : '')
                          }
                        >
                          <span className="g">{index + 1}</span>
                          <span className="c">
                            <span className="k">{line.kind.padEnd(16, ' ')}</span>
                            <span className="s">{line.value}</span>{' '}
                            <span className="n">{line.weight.toFixed(2)}</span>
                          </span>
                        </div>
                      ))}
                      <div className="ln">
                        <span className="g" />
                        <span className="c faint">
                          {proposal.next.quality.reasons.join(' · ') || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="pad" style={{ borderTop: '1px solid var(--line)' }}>
                  <dl className="kv">
                    <dt className="kv-key">Neden</dt>
                    <dd className="kv-val">{proposal.reason}</dd>
                    <dt className="kv-key">Güven</dt>
                    <dd className="kv-val mono">
                      {percent(proposal.previous.quality.score)} → {percent(proposal.confidence)}
                    </dd>
                    <dt className="kv-key">Bağlam</dt>
                    <dd className="kv-val mono">
                      {proposal.next.context.urlPattern} · frame {proposal.next.context.frameDepth}{' '}
                      · shadow {proposal.next.context.shadowDepth}
                    </dd>
                    <dt className="kv-key">Öğe</dt>
                    <dd className="kv-val mono">
                      {proposal.next.target.tag} · {proposal.next.target.role} ·{' '}
                      {proposal.next.target.type}
                    </dd>
                  </dl>
                </div>
              </>
            ) : (
              <Empty glyph="shield" text="Öneri seçilmedi" />
            )}
          </div>
        </div>
      ) : null}

      {tab === 'fragile' ? (
        <div className="gridwrap">
          {fragile.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Adım</th>
                  <th style={{ width: 70 }}>Deneme</th>
                  <th style={{ width: 60 }}>Kesin</th>
                  <th style={{ width: 60 }}>Düşük</th>
                  <th style={{ width: 90 }}>Bulunamayan</th>
                  <th style={{ width: 70 }}>Onarılan</th>
                  <th style={{ width: 160 }}>Güven</th>
                  <th style={{ width: 90 }}>Son</th>
                </tr>
              </thead>
              <tbody>
                {fragile.map((entry) => (
                  <tr key={entry.descriptorId}>
                    <td>{entry.title}</td>
                    <td className="num">{entry.attempts}</td>
                    <td className="num ok">{entry.exact}</td>
                    <td className="num warn">{entry.low}</td>
                    <td className="num bad">{entry.missing}</td>
                    <td className="num">{entry.healed}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bar
                          value={entry.meanConfidence}
                          tone={entry.meanConfidence > 0.82 ? 'ok' : 'warn'}
                        />
                        <span className="mono">{percent(entry.meanConfidence)}</span>
                      </span>
                    </td>
                    <td className="muted">{formatShortDate(entry.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty glyph="pulse" text="Kırılgan adım yok" />
          )}
        </div>
      ) : null}

      {tab === 'catalog' ? (
        <>
          <div className="tb">
            <div className="search" style={{ width: 300 }}>
              <Glyph name="search" size={13} />
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Descriptor filtrele"
                spellCheck={false}
                aria-label="Descriptor filtresi"
              />
            </div>
            <span className="push" />
            <span className="faint">{rows.length} kayıt</span>
          </div>
          <div className="gridwrap">
            {rows.length ? (
              <table className="grid">
                <thead>
                  <tr>
                    <th>Ad</th>
                    <th style={{ width: 90 }}>Etiket</th>
                    <th style={{ width: 100 }}>Rol</th>
                    <th>Adres</th>
                    <th style={{ width: 90 }}>Kalite</th>
                    <th style={{ width: 90 }}>Tarih</th>
                    <th style={{ width: 70 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.name || entry.id.slice(0, 12)}</td>
                      <td className="mono muted">{entry.tag}</td>
                      <td className="mono muted">{entry.role}</td>
                      <td className="mono">{entry.urlPattern}</td>
                      <td>
                        <Pill tone={TIER_TONE[entry.tier] ?? 'flat'}>{percent(entry.score)}</Pill>
                      </td>
                      <td className="muted">{formatShortDate(entry.capturedAt)}</td>
                      <td className="act">
                        <button
                          className="ib"
                          title="İstatistik"
                          onClick={() => void inspect(entry.id)}
                          type="button"
                        >
                          <Glyph name="spark" size={13} />
                        </button>
                        <button
                          className="ib danger"
                          title="Sil"
                          onClick={() => void drop(entry.id)}
                          type="button"
                        >
                          <Glyph name="trash" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty glyph="target" text="Descriptor yok" />
            )}
          </div>
        </>
      ) : null}

      {tab === 'strategies' ? (
        <div className="gridwrap">
          {strategyRows.length ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Strateji</th>
                  <th style={{ width: 90 }}>Deneme</th>
                  <th style={{ width: 90 }}>Tutan</th>
                  <th style={{ width: 220 }}>Başarı</th>
                  <th style={{ width: 100 }}>Ağırlıklı</th>
                  <th style={{ width: 90 }}>Son</th>
                </tr>
              </thead>
              <tbody>
                {strategyRows.map(({ kind, stat }) => (
                  <tr key={kind}>
                    <td className="mono">{kind}</td>
                    <td className="num">{stat.attempts}</td>
                    <td className="num">{stat.hits}</td>
                    <td>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Bar
                          value={ratio(stat.hits, stat.attempts)}
                          tone={ratio(stat.hits, stat.attempts) > 0.7 ? 'ok' : 'warn'}
                        />
                        <span className="mono">{percent(ratio(stat.hits, stat.attempts))}</span>
                      </span>
                    </td>
                    <td className="num">{stat.weightedSuccess.toFixed(2)}</td>
                    <td className="muted">{formatShortDate(stat.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty
              glyph="spark"
              text={scope ? 'Strateji istatistiği yok' : 'Katalogdan bir kayıt seçin'}
            />
          )}
        </div>
      ) : null}

      {validation && !validation.ok ? (
        <div
          className="issues"
          style={{ borderTop: '1px solid var(--line)', maxHeight: 140, overflow: 'auto' }}
        >
          {validation.errors.slice(0, 8).map((issue, index) => (
            <div key={'e' + index} className="issue">
              <Sym tone="bad" />
              <span className="msg">{issue.detail}</span>
              <span className="loc">{issue.code}</span>
            </div>
          ))}
          {validation.warnings.slice(0, 8).map((issue, index) => (
            <div key={'w' + index} className="issue">
              <Sym tone="warn" />
              <span className="msg">{issue.detail}</span>
              <span className="loc">{issue.code}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )
}
