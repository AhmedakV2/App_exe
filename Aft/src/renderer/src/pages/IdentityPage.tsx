import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { FragileStep, HealthSummary } from '../../../main/data'
import type { DescriptorSummary, HealingProposal, StrategyStat } from '../../../main/identity'
import type { ValidationReport } from '../../../main/model'
import { Glyph, IconButton } from '../icons'
import { Bar, Card, Empty, Metric, PageHead, Pill, Segmented, Skeleton, TextButton } from '../ui'
import { formatShortDate, percent, ratio } from '../format'
import type { Report } from '../report'

type Tab = 'fragile' | 'catalog' | 'approvals' | 'strategies'

const TIER_TONE: Record<string, 'ok' | 'warn' | 'bad'> = {
  strong: 'ok',
  fair: 'warn',
  weak: 'bad'
}

const DECISION_TONE: Record<string, 'ok' | 'warn' | 'bad'> = {
  auto: 'ok',
  approval: 'warn',
  blocked: 'bad'
}

export default function IdentityPage({
  revision,
  onReport
}: {
  revision: number
  onReport: (report: Report) => void
}): React.JSX.Element {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [fragile, setFragile] = useState<FragileStep[]>([])
  const [catalog, setCatalog] = useState<DescriptorSummary[]>([])
  const [approvals, setApprovals] = useState<HealingProposal[]>([])
  const [strategies, setStrategies] = useState<Record<string, StrategyStat>>({})
  const [scope, setScope] = useState('')
  const [validation, setValidation] = useState<ValidationReport | null>(null)
  const [tab, setTab] = useState<Tab>('fragile')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

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

  const weak = catalog.filter((entry) => entry.tier === 'weak').length

  return (
    <div className="page">
      <PageHead
        title="Kimlik Sağlığı"
        meta={
          <>
            <Pill>{catalog.length} descriptor</Pill>
            {summary && summary.missing ? (
              <Pill tone="bad">{summary.missing} bulunamayan</Pill>
            ) : null}
            {weak ? <Pill tone="warn">{weak} zayıf</Pill> : null}
            {approvals.length ? <Pill tone="accent">{approvals.length} onay</Pill> : null}
            {scope ? <Pill>{scope}</Pill> : null}
            {validation ? (
              <Pill tone={validation.ok ? 'ok' : 'bad'}>model {validation.checked}</Pill>
            ) : null}
          </>
        }
        actions={
          <>
            <TextButton
              glyph="shield"
              label="Modeli doğrula"
              onClick={() => void validate()}
              busy={busy}
            />
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

      <div className="metric-row wide">
        <Metric label="koşum" value={summary?.runs ?? 0} />
        <Metric label="adım" value={summary?.steps ?? 0} />
        <Metric label="kesin eşleşme" value={summary?.resolved ?? 0} tone="ok" />
        <Metric
          label="düşük güven"
          value={summary?.low ?? 0}
          tone={summary?.low ? 'warn' : 'flat'}
        />
        <Metric
          label="bulunamayan"
          value={summary?.missing ?? 0}
          tone={summary?.missing ? 'bad' : 'flat'}
        />
        <Metric
          label="onarılan"
          value={summary?.healed ?? 0}
          tone={summary?.healed ? 'accent' : 'flat'}
        />
        <Metric label="ortalama güven" value={percent(summary?.meanConfidence ?? 0)} />
        <Metric label="son koşum" value={formatShortDate(summary?.lastRunAt ?? 0)} />
      </div>

      <div className="page-body">
        <Card
          label="Kimlik kayıtları"
          grow
          scroll
          actions={
            <Segmented
              items={[
                { id: 'fragile', label: 'Kırılgan' },
                { id: 'catalog', label: 'Katalog' },
                { id: 'approvals', label: 'Onay' },
                { id: 'strategies', label: 'Strateji' }
              ]}
              value={tab}
              onPick={(id) => setTab(id as Tab)}
            />
          }
        >
          {tab === 'fragile' ? (
            busy && !fragile.length ? (
              <Skeleton rows={6} />
            ) : fragile.length ? (
              <div className="table-scroll">
                <div className="table wide">
                  <div className="tr th">
                    <span className="td grow">adım</span>
                    <span className="td num">deneme</span>
                    <span className="td num">kesin</span>
                    <span className="td num">düşük</span>
                    <span className="td num">bulunamayan</span>
                    <span className="td num">onarılan</span>
                    <span className="td wide">güven</span>
                    <span className="td wide">son</span>
                  </div>
                  {fragile.map((entry) => (
                    <div key={entry.descriptorId} className="tr">
                      <span className="td grow">{entry.title}</span>
                      <span className="td num">{entry.attempts}</span>
                      <span className="td num ok">{entry.exact}</span>
                      <span className="td num warn">{entry.low}</span>
                      <span className="td num bad">{entry.missing}</span>
                      <span className="td num">{entry.healed}</span>
                      <span className="td wide">
                        <Bar
                          value={entry.meanConfidence}
                          tone={entry.meanConfidence > 0.82 ? 'ok' : 'warn'}
                        />
                        {percent(entry.meanConfidence)}
                      </span>
                      <span className="td wide dim">{formatShortDate(entry.lastSeenAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty
                glyph="pulse"
                text="Kırılgan adım yok"
                hint="Tüm adımlar son koşumlarda yüksek güvenle çözümlendi."
              />
            )
          ) : null}

          {tab === 'catalog' ? (
            <>
              <div className="search">
                <Glyph name="search" size={13} />
                <input
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                  placeholder="Filtre"
                  spellCheck={false}
                  aria-label="Descriptor filtresi"
                />
              </div>
              {rows.length ? (
                <div className="table-scroll">
                  <div className="table wide">
                    <div className="tr th">
                      <span className="td grow">ad</span>
                      <span className="td wide">etiket</span>
                      <span className="td wide">rol</span>
                      <span className="td grow">adres</span>
                      <span className="td wide">kalite</span>
                      <span className="td wide">tarih</span>
                      <span className="td act" />
                    </div>
                    {rows.map((entry) => (
                      <div key={entry.id} className="tr">
                        <span className="td grow">{entry.name || entry.id.slice(0, 12)}</span>
                        <span className="td wide dim">{entry.tag}</span>
                        <span className="td wide dim">{entry.role}</span>
                        <span className="td grow mono">{entry.urlPattern}</span>
                        <span className="td wide">
                          <Pill tone={TIER_TONE[entry.tier] ?? 'flat'}>{percent(entry.score)}</Pill>
                        </span>
                        <span className="td wide dim">{formatShortDate(entry.capturedAt)}</span>
                        <span className="td act">
                          <IconButton
                            name="spark"
                            title="İstatistik"
                            onClick={() => void inspect(entry.id)}
                            small
                          />
                          <IconButton
                            name="trash"
                            title="Sil"
                            onClick={() => void drop(entry.id)}
                            small
                            danger
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <Empty
                  glyph="target"
                  text={filter ? 'Eşleşen descriptor yok' : 'Descriptor yok'}
                  hint={
                    filter
                      ? 'Filtreyi temizleyerek tüm kimlik kataloğunu görebilirsiniz.'
                      : 'Bir senaryo kaydettiğinizde yakalanan öğe kimlikleri burada toplanır.'
                  }
                />
              )}
            </>
          ) : null}

          {tab === 'approvals' ? (
            approvals.length ? (
              <div className="list">
                {approvals.map((entry) => (
                  <div key={entry.descriptorId} className="approval">
                    <div className="approval-head">
                      <Pill tone={DECISION_TONE[entry.decision] ?? 'flat'}>{entry.decision}</Pill>
                      <span className="approval-title">
                        {entry.next.target.name || entry.next.target.tag}
                      </span>
                      <span className="approval-conf">{percent(entry.confidence)}</span>
                      <span className="approval-push" />
                      <TextButton
                        glyph="check"
                        label="Onayla"
                        onClick={() => void approve(entry.descriptorId)}
                        tone="primary"
                      />
                      <TextButton
                        glyph="close"
                        label="Reddet"
                        onClick={() => void reject(entry.descriptorId)}
                        tone="danger"
                      />
                    </div>
                    <div className="chip-row">
                      {entry.gained.map((kind) => (
                        <span key={'g' + kind} className="chip ok">
                          +{kind}
                        </span>
                      ))}
                      {entry.lost.map((kind) => (
                        <span key={'l' + kind} className="chip bad">
                          −{kind}
                        </span>
                      ))}
                    </div>
                    <div className="approval-reason">{entry.reason}</div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                glyph="shield"
                text="Bekleyen onay yok"
                hint="Otomatik onarım önerileri onay beklediğinde bu listede görünür."
              />
            )
          ) : null}

          {tab === 'strategies' ? (
            strategyRows.length ? (
              <div className="table-scroll">
                <div className="table wide">
                  <div className="tr th">
                    <span className="td grow">strateji</span>
                    <span className="td num">deneme</span>
                    <span className="td num">tutan</span>
                    <span className="td wide">başarı</span>
                    <span className="td wide">son</span>
                  </div>
                  {strategyRows.map(({ kind, stat }) => (
                    <div key={kind} className="tr">
                      <span className="td grow">{kind}</span>
                      <span className="td num">{stat.attempts}</span>
                      <span className="td num">{stat.hits}</span>
                      <span className="td wide">
                        <Bar
                          value={ratio(stat.hits, stat.attempts)}
                          tone={ratio(stat.hits, stat.attempts) > 0.7 ? 'ok' : 'warn'}
                        />
                        {percent(ratio(stat.hits, stat.attempts))}
                      </span>
                      <span className="td wide dim">{formatShortDate(stat.lastSeenAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty
                glyph="spark"
                text="Strateji istatistiği yok"
                hint="Senaryolar çalıştıkça hangi kimlik stratejisinin tuttuğu burada ölçülür."
              />
            )
          ) : null}
        </Card>

        {validation && !validation.ok ? (
          <Card label="Model uyarıları" scroll>
            <div className="issues">
              {validation.errors.slice(0, 8).map((issue, index) => (
                <div key={'e' + index} className="issue bad">
                  <Glyph name="alert" size={12} />
                  {issue.code}: {issue.detail}
                </div>
              ))}
              {validation.warnings.slice(0, 8).map((issue, index) => (
                <div key={'w' + index} className="issue warn">
                  <Glyph name="info" size={12} />
                  {issue.code}: {issue.detail}
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
