import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FragileStep, HealthSummary } from '../../../main/data'
import type { DescriptorSummary, HealingProposal, StrategyStat } from '../../../main/identity'
import type { ValidationReport } from '../../../main/model'
import type { ProjectionPayload, ResolvePayload, ScanPayload } from '../../../main/bridge'
import { Glyph, IconButton } from '../icons'
import { Bar, Card, Empty, Metric, PageHead, Pill, Segmented, TextButton } from '../ui'
import { formatDate, formatMs, formatShortDate, percent, ratio, shortUrl } from '../format'
import type { Report } from '../report'

type Tab = 'catalog' | 'fragile' | 'approvals' | 'strategies' | 'projection' | 'model'

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

const STATE_TONE: Record<string, 'ok' | 'warn' | 'bad' | 'flat'> = {
  exact: 'ok',
  low: 'warn',
  ambiguous: 'warn',
  missing: 'bad'
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
  const [scan, setScan] = useState<ScanPayload | null>(null)
  const [resolved, setResolved] = useState<ResolvePayload | null>(null)
  const [projection, setProjection] = useState<ProjectionPayload | null>(null)
  const [selected, setSelected] = useState('')
  const [tab, setTab] = useState<Tab>('catalog')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const selectedRef = useRef('')

  const choose = useCallback((id: string): void => {
    selectedRef.current = id
    setSelected(id)
  }, [])

  const say = useCallback(
    (level: Report['level'], text: string, detail?: string[]): void => {
      onReport({ level, text, detail })
    },
    [onReport]
  )

  const loadStats = useCallback(
    async (id: string): Promise<void> => {
      if (!id) return
      const result = await window.aftIdentity.stats(id)
      if (!result.ok || !result.data) {
        say('err', 'İstatistik okunamadı: ' + result.message)
        return
      }
      setStrategies(result.data.strategies)
      setScope(result.data.scope)
    },
    [say]
  )

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
      } else {
        say('err', 'Kimlik sağlığı okunamadı: ' + health.message)
      }

      if (pending.ok && pending.data) setApprovals(pending.data)
      else say('err', 'Onay kuyruğu okunamadı: ' + pending.message)

      if (!list.ok || !list.data) {
        say('err', 'Descriptor kataloğu okunamadı: ' + list.message)
        return
      }

      setCatalog(list.data)
      const current = selectedRef.current
      const next = list.data.some((entry) => entry.id === current)
        ? current
        : (list.data[0]?.id ?? '')
      choose(next)
      if (next) await loadStats(next)
    } catch (error) {
      say('err', 'Köprü hatası: ' + (error as Error).message)
    } finally {
      setBusy(false)
    }
  }, [choose, loadStats, say])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, revision])

  const rescan = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftIdentity.scan()
      if (!result.ok || !result.data) {
        say('err', 'Sayfa taranamadı: ' + result.message)
        return
      }
      setScan(result.data)
      say('ok', 'Sayfa tarandı: ' + result.data.elements + ' eleman', [
        shortUrl(result.data.url) || result.data.url
      ])
    } catch (error) {
      say('err', 'Köprü hatası: ' + (error as Error).message)
    } finally {
      setBusy(false)
    }
  }, [say])

  const validate = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftIdentity.validate()
      if (!result.ok || !result.data) {
        say('err', 'Model doğrulanamadı: ' + result.message)
        return
      }
      setValidation(result.data)
      setTab('model')
      say(result.data.ok ? 'ok' : 'err', 'Model doğrulaması: ' + result.data.checked + ' düğüm', [
        ...result.data.errors.slice(0, 4).map((issue) => issue.code + ': ' + issue.detail),
        ...result.data.warnings.slice(0, 4).map((issue) => issue.code + ': ' + issue.detail)
      ])
    } catch (error) {
      say('err', 'Köprü hatası: ' + (error as Error).message)
    } finally {
      setBusy(false)
    }
  }, [say])

  const resolve = useCallback(
    async (id: string): Promise<void> => {
      setBusy(true)
      try {
        const result = await window.aftIdentity.resolve(id)
        if (!result.ok || !result.data) {
          say('err', 'Descriptor çözümlenemedi: ' + result.message)
          return
        }
        setResolved(result.data)
        choose(id)
        setTab('strategies')
        await loadStats(id)
        say(
          result.data.resolution.state === 'exact' ? 'ok' : 'err',
          'Çözümleme: ' +
            result.data.resolution.state +
            ' · ' +
            percent(result.data.resolution.confidence),
          [
            result.data.resolution.message,
            result.data.healed ? 'descriptor onarıldı' : '',
            'sıra ' + result.data.ordinal
          ].filter(Boolean)
        )
      } catch (error) {
        say('err', 'Köprü hatası: ' + (error as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [choose, loadStats, say]
  )

  const approve = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.approve(id)
      say(
        result.ok ? 'ok' : 'err',
        result.ok ? 'Onarım onaylandı' : 'Onaylanamadı: ' + result.message
      )
      await load()
    },
    [load, say]
  )

  const reject = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.reject(id)
      say(
        result.ok ? 'note' : 'err',
        result.ok ? 'Onarım reddedildi' : 'Reddedilemedi: ' + result.message
      )
      await load()
    },
    [load, say]
  )

  const drop = useCallback(
    async (id: string): Promise<void> => {
      const result = await window.aftIdentity.remove(id)
      say(
        result.ok ? 'note' : 'err',
        result.ok ? 'Descriptor silindi' : 'Silinemedi: ' + result.message
      )
      if (selectedRef.current === id) {
        choose('')
        setResolved(null)
        setStrategies({})
        setScope('')
      }
      await load()
    },
    [choose, load, say]
  )

  const inspect = useCallback(
    async (id: string): Promise<void> => {
      choose(id)
      setResolved(null)
      await loadStats(id)
      setTab('strategies')
    },
    [choose, loadStats]
  )

  const project = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftIdentity.project('playback')
      if (!result.ok || !result.data) {
        say('err', 'Projeksiyon alınamadı: ' + result.message)
        return
      }
      setProjection(result.data)
      setValidation(result.data.validation)
      setTab('projection')
      say('ok', 'Projeksiyon: ' + result.data.projection.elements.length + ' eleman', [
        'jeton ~' + result.data.projection.estimatedTokens,
        'kör nokta ' + result.data.projection.blindSpots.length,
        result.data.projection.truncated ? 'liste kırpıldı' : 'liste tam'
      ])
    } catch (error) {
      say('err', 'Köprü hatası: ' + (error as Error).message)
    } finally {
      setBusy(false)
    }
  }, [say])

  const rows = useMemo(() => {
    const text = filter.trim().toLowerCase()
    if (!text) return catalog
    return catalog.filter(
      (entry) =>
        entry.name.toLowerCase().includes(text) ||
        entry.role.toLowerCase().includes(text) ||
        entry.tag.toLowerCase().includes(text) ||
        entry.id.toLowerCase().includes(text) ||
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
  const current = catalog.find((entry) => entry.id === selected) ?? null

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
            {scan ? <Pill>{scan.elements} eleman</Pill> : null}
            {validation ? (
              <Pill tone={validation.ok ? 'ok' : 'bad'}>model {validation.checked}</Pill>
            ) : null}
          </>
        }
        actions={
          <>
            <TextButton
              glyph="radar"
              label="Sayfayı tara"
              onClick={() => void rescan()}
              disabled={busy}
            />
            <TextButton
              glyph="shield"
              label="Modeli doğrula"
              onClick={() => void validate()}
              disabled={busy}
            />
            <TextButton
              glyph="layers"
              label="Projeksiyon"
              onClick={() => void project()}
              disabled={busy}
            />
            <TextButton
              glyph="target"
              label="Çözümle"
              onClick={() => void resolve(selected)}
              disabled={busy || !selected}
              tone="primary"
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

      <div className="page-body cols-2">
        <Card
          label="Kimlik kayıtları"
          grow
          scroll
          actions={
            <Segmented
              items={[
                { id: 'catalog', label: 'Katalog' },
                { id: 'fragile', label: 'Kırılgan' },
                { id: 'approvals', label: 'Onay' },
                { id: 'strategies', label: 'Strateji' },
                { id: 'projection', label: 'Projeksiyon' },
                { id: 'model', label: 'Model' }
              ]}
              value={tab}
              onPick={(id) => setTab(id as Tab)}
            />
          }
        >
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
                <div className="table">
                  <div className="tr th">
                    <span className="td grow">ad</span>
                    <span className="td tight">etiket</span>
                    <span className="td tight">rol</span>
                    <span className="td grow">adres</span>
                    <span className="td num">kalite</span>
                    <span className="td date">tarih</span>
                    <span className="td act" />
                  </div>
                  {rows.map((entry) => (
                    <div key={entry.id} className={'tr' + (entry.id === selected ? ' sel' : '')}>
                      <span className="td grow pick" onClick={() => void inspect(entry.id)}>
                        {entry.name || entry.id.slice(0, 12)}
                      </span>
                      <span className="td tight dim">{entry.tag}</span>
                      <span className="td tight dim">{entry.role}</span>
                      <span className="td grow mono">{entry.urlPattern}</span>
                      <span className="td num">
                        <Pill tone={TIER_TONE[entry.tier] ?? 'flat'}>{percent(entry.score)}</Pill>
                      </span>
                      <span className="td date dim">{formatShortDate(entry.capturedAt)}</span>
                      <span className="td act">
                        <IconButton
                          name="target"
                          title="Sayfada çözümle"
                          onClick={() => void resolve(entry.id)}
                          disabled={busy}
                          small
                        />
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
                          disabled={busy}
                          small
                          danger
                        />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty glyph="target" text="Descriptor yok, önce kayıt alın" />
              )}
            </>
          ) : null}

          {tab === 'fragile' ? (
            fragile.length ? (
              <div className="table">
                <div className="tr th">
                  <span className="td grow">adım</span>
                  <span className="td num">deneme</span>
                  <span className="td num">kesin</span>
                  <span className="td num">düşük</span>
                  <span className="td num">yok</span>
                  <span className="td num">onarım</span>
                  <span className="td wide">güven</span>
                  <span className="td date">son</span>
                </div>
                {fragile.map((entry) => (
                  <div key={entry.descriptorId} className="tr">
                    <span className="td grow pick" onClick={() => void inspect(entry.descriptorId)}>
                      {entry.title}
                    </span>
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
                    <span className="td date dim">{formatShortDate(entry.lastSeenAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty glyph="pulse" text="Kırılgan adım yok" />
            )
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
              <Empty glyph="shield" text="Bekleyen onay yok" />
            )
          ) : null}

          {tab === 'strategies' ? (
            strategyRows.length ? (
              <div className="table">
                <div className="tr th">
                  <span className="td grow">strateji</span>
                  <span className="td num">deneme</span>
                  <span className="td num">tutan</span>
                  <span className="td wide">başarı</span>
                  <span className="td date">son</span>
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
                    <span className="td date dim">{formatShortDate(stat.lastSeenAt)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty glyph="spark" text="Strateji istatistiği yok" />
            )
          ) : null}

          {tab === 'projection' ? (
            projection ? (
              <>
                <div className="metric-row">
                  <Metric label="eleman" value={projection.projection.elements.length} />
                  <Metric label="jeton" value={projection.projection.estimatedTokens} />
                  <Metric
                    label="kör nokta"
                    value={projection.projection.blindSpots.length}
                    tone={projection.projection.blindSpots.length ? 'warn' : 'flat'}
                  />
                  <Metric label="gizli" value={projection.projection.outside.hidden} />
                  <Metric
                    label="kırpıldı"
                    value={projection.projection.truncated ? 'evet' : 'hayır'}
                    tone={projection.projection.truncated ? 'warn' : 'flat'}
                  />
                </div>

                {projection.projection.elements.length ? (
                  <div className="table">
                    <div className="tr th">
                      <span className="td no">#</span>
                      <span className="td tight">etiket</span>
                      <span className="td tight">rol</span>
                      <span className="td grow">ad</span>
                      <span className="td grow mono">ref</span>
                    </div>
                    {projection.projection.elements.slice(0, 300).map((entry) => (
                      <div key={entry.ref} className="tr">
                        <span className="td no">{entry.ordinal}</span>
                        <span className="td tight dim">{entry.tag}</span>
                        <span className="td tight dim">{entry.role || '—'}</span>
                        <span className="td grow">{entry.name || '—'}</span>
                        <span className="td grow mono">{entry.ref}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty glyph="layers" text="Projeksiyonda eleman yok" />
                )}
              </>
            ) : (
              <Empty glyph="layers" text="Projeksiyon alınmadı" />
            )
          ) : null}

          {tab === 'model' ? (
            validation ? (
              <>
                <div className="metric-row">
                  <Metric label="düğüm" value={validation.checked} />
                  <Metric
                    label="hata"
                    value={validation.errors.length}
                    tone={validation.errors.length ? 'bad' : 'ok'}
                  />
                  <Metric
                    label="uyarı"
                    value={validation.warnings.length}
                    tone={validation.warnings.length ? 'warn' : 'flat'}
                  />
                </div>
                <div className="issues">
                  {validation.errors.map((issue, index) => (
                    <div key={'e' + index} className="issue bad">
                      <Glyph name="alert" size={12} />
                      {issue.code}: {issue.detail}
                    </div>
                  ))}
                  {validation.warnings.map((issue, index) => (
                    <div key={'w' + index} className="issue warn">
                      <Glyph name="info" size={12} />
                      {issue.code}: {issue.detail}
                    </div>
                  ))}
                  {!validation.errors.length && !validation.warnings.length ? (
                    <div className="issue">
                      <Glyph name="check" size={12} />
                      model temiz
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <Empty glyph="shield" text="Model henüz doğrulanmadı" />
            )
          ) : null}
        </Card>

        <Card label="Seçili descriptor" scroll>
          {current ? (
            <>
              <div className="kv">
                <span className="kv-key">ad</span>
                <span className="kv-val">{current.name || '—'}</span>
                <span className="kv-key">kimlik</span>
                <span className="kv-val mono">{current.id}</span>
                <span className="kv-key">etiket</span>
                <span className="kv-val">{current.tag}</span>
                <span className="kv-key">rol</span>
                <span className="kv-val">{current.role || '—'}</span>
                <span className="kv-key">adres kalıbı</span>
                <span className="kv-val mono">{current.urlPattern}</span>
                <span className="kv-key">kalite</span>
                <span className="kv-val">
                  {current.tier} · {percent(current.score)}
                </span>
                <span className="kv-key">yakalama</span>
                <span className="kv-val">{formatDate(current.capturedAt)}</span>
                <span className="kv-key">kapsam</span>
                <span className="kv-val mono">{scope || '—'}</span>
              </div>

              <div className="step-actions">
                <TextButton
                  glyph="target"
                  label="Sayfada çözümle"
                  onClick={() => void resolve(current.id)}
                  disabled={busy}
                  tone="primary"
                />
                <TextButton
                  glyph="trash"
                  label="Sil"
                  onClick={() => void drop(current.id)}
                  disabled={busy}
                  tone="danger"
                />
              </div>

              {resolved ? (
                <>
                  <div className="card-split">Çözümleme</div>
                  <div className="metric-row">
                    <Metric
                      label="durum"
                      value={resolved.resolution.state}
                      tone={STATE_TONE[resolved.resolution.state] ?? 'flat'}
                    />
                    <Metric label="güven" value={percent(resolved.resolution.confidence)} />
                    <Metric label="sıra" value={resolved.ordinal} />
                    <Metric label="süre" value={formatMs(resolved.resolution.durationMs)} />
                  </div>

                  <div className="rows">
                    {resolved.resolution.trace.map((entry, index) => (
                      <div key={index} className={'row' + (entry.skipped ? ' dim' : '')}>
                        <span className="row-key">{entry.kind}</span>
                        <span className="row-mid">{entry.reason}</span>
                        <span className="row-num">{entry.skipped ? '—' : entry.matched}</span>
                        <span className="row-num">{formatMs(entry.durationMs)}</span>
                      </div>
                    ))}
                  </div>

                  {resolved.proposal ? (
                    <div className="approval">
                      <div className="approval-head">
                        <Pill tone={DECISION_TONE[resolved.proposal.decision] ?? 'flat'}>
                          {resolved.proposal.decision}
                        </Pill>
                        <span className="approval-title">onarım önerisi</span>
                        <span className="approval-conf">
                          {percent(resolved.proposal.confidence)}
                        </span>
                      </div>
                      <div className="approval-reason">{resolved.proposal.reason}</div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {scan ? (
                <>
                  <div className="card-split">Son tarama</div>
                  <div className="kv">
                    <span className="kv-key">adres</span>
                    <span className="kv-val mono">{shortUrl(scan.url) || scan.url}</span>
                    <span className="kv-key">başlık</span>
                    <span className="kv-val">{scan.title || '—'}</span>
                    <span className="kv-key">eleman</span>
                    <span className="kv-val">{scan.elements}</span>
                    <span className="kv-key">zaman</span>
                    <span className="kv-val">{formatDate(scan.capturedAt)}</span>
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <Empty glyph="target" text="Descriptor seçilmedi" />
          )}
        </Card>
      </div>
    </div>
  )
}
