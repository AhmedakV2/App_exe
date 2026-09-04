import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AlternativeView, RecordStepView, RecordView } from '../../main/bridge/record-types'
import type { RecordEditRequest } from '../../main/bridge/record-types'
import type { AssertionOption } from '../../main/record/types'
import { Glyph, IconButton } from './icons'
import { Empty, TextButton } from './ui'

type ReportLevel = 'ok' | 'err' | 'note'

export type RecordReport = { level: ReportLevel; text: string; detail?: string[] }

const LEVEL_LABELS: Record<string, string> = {
  strong: 'Güçlü kimlik',
  weak: 'Zayıf kimlik',
  blocked: 'Çözülemedi'
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Kayıt yok',
  recording: 'Kayıtta',
  paused: 'Duraklatıldı',
  stopped: 'Durduruldu'
}

const WAIT_PRESETS: number[] = [500, 1000, 3000, 5000]

const NUMERIC_KINDS: ReadonlySet<string> = new Set(['scroll', 'wait', 'hover'])

const MIN_WAIT_MS = 100

const MAX_WAIT_MS = 300000

function levelClass(level: string): string {
  if (level === 'strong') return 'ok'
  if (level === 'weak') return 'warn'
  return 'bad'
}

function shortUrl(raw: string): string {
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname)
  } catch {
    return raw
  }
}

function blurOnEnter(event: React.KeyboardEvent<HTMLInputElement>): void {
  if (event.key === 'Enter') event.currentTarget.blur()
}

const StepRow = memo(function StepRow({
  step,
  open,
  busy,
  onToggle,
  onMove,
  onRemove,
  onRetitle,
  onValue,
  onTarget,
  onWait,
  onAssert,
  onTolerate
}: {
  step: RecordStepView
  open: boolean
  busy: boolean
  onToggle: (id: string) => void
  onMove: (id: string, offset: number) => void
  onRemove: (id: string) => void
  onRetitle: (id: string, title: string) => void
  onValue: (id: string, value: string) => void
  onTarget: (id: string, optionId: string) => void
  onWait: (id: string, timeoutMs: number) => void
  onAssert: (id: string, option: AssertionOption) => void
  onTolerate: (id: string, flag: boolean) => void
}): React.JSX.Element {
  const commitTitle = useCallback(
    (event: React.FocusEvent<HTMLInputElement>): void => {
      const next = event.target.value
      if (next.trim() && next !== step.title) onRetitle(step.id, next)
    },
    [onRetitle, step.id, step.title]
  )

  const commitValue = useCallback(
    (event: React.FocusEvent<HTMLInputElement>): void => {
      const next = event.target.value
      if (next !== step.value) onValue(step.id, next)
    },
    [onValue, step.id, step.value]
  )

  const commitWait = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key !== 'Enter') return
      const parsed = Number(event.currentTarget.value)
      if (!Number.isFinite(parsed)) return
      const wait = Math.min(MAX_WAIT_MS, Math.max(MIN_WAIT_MS, Math.round(parsed)))
      onWait(step.id, wait)
      event.currentTarget.blur()
    },
    [onWait, step.id]
  )

  return (
    <div className={'rec-step ' + levelClass(step.level) + (open ? ' open' : '')}>
      <button
        className="rec-step-head"
        onClick={() => onToggle(step.id)}
        aria-expanded={open}
        type="button"
      >
        <span className="rec-step-no">{step.order + 1}</span>
        <span className="rec-step-dot" />
        <span className="rec-step-title">{step.title}</span>
        <span className="rec-step-kind">{step.kind}</span>
      </button>

      {open ? (
        <div className="rec-step-body">
          <div className="rec-facts">
            <span className={'rec-tag ' + levelClass(step.level)}>{LEVEL_LABELS[step.level]}</span>
            <span className="rec-tag">güven %{Math.round(step.confidence * 100)}</span>
            <span className="rec-tag">kalite %{Math.round(step.score * 100)}</span>
            {step.targetKind === 'none' ? null : <span className="rec-tag">{step.targetKind}</span>}
            {step.frameDepth ? <span className="rec-tag">çerçeve {step.frameDepth}</span> : null}
            {step.shadowDepth ? <span className="rec-tag">shadow {step.shadowDepth}</span> : null}
            {step.ambiguous ? <span className="rec-tag warn">Belirsiz</span> : null}
          </div>

          {step.targetLabel ? <div className="rec-target">hedef: {step.targetLabel}</div> : null}

          {step.strategies.length ? (
            <div className="rec-strategies">
              {step.strategies.map((entry) => (
                <span key={entry} className="rec-chip">
                  {entry}
                </span>
              ))}
            </div>
          ) : null}

          {step.reasons.length ? (
            <ul className="rec-reasons">
              {step.reasons.map((reason, position) => (
                <li key={position}>{reason}</li>
              ))}
            </ul>
          ) : null}

          {step.alternatives.length ? (
            <div className="rec-block">
              <span className="rec-block-label">Hedefler</span>
              <div className="rec-options">
                {step.alternatives.map((option: AlternativeView) => (
                  <button
                    key={option.id}
                    className={'rec-option' + (option.unique ? ' solid' : '')}
                    onClick={() => onTarget(step.id, option.id)}
                    disabled={busy}
                    title={option.detail}
                    type="button"
                  >
                    <Glyph name="target" size={12} />
                    <span className="rec-option-label">{option.label}</span>
                    <span className="rec-option-detail">{option.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="rec-field">
            <span>Başlık</span>
            <input
              key={'title:' + step.title}
              defaultValue={step.title}
              onBlur={commitTitle}
              onKeyDown={blurOnEnter}
              disabled={busy}
              spellCheck={false}
            />
          </label>

          {step.editable ? (
            <label className="rec-field">
              <span>{step.valueLabel}</span>
              <input
                key={'value:' + step.value}
                type={NUMERIC_KINDS.has(step.kind) ? 'number' : 'text'}
                defaultValue={step.value}
                onBlur={commitValue}
                onKeyDown={blurOnEnter}
                disabled={busy}
                spellCheck={false}
              />
            </label>
          ) : null}

          <div className="rec-block">
            <span className="rec-block-label">Sonrasına bekleme ekle</span>
            <div className="rec-options">
              {WAIT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  className="rec-option"
                  onClick={() => onWait(step.id, preset)}
                  disabled={busy}
                  type="button"
                >
                  <Glyph name="clock" size={12} />
                  <span className="rec-option-label">{preset} ms</span>
                </button>
              ))}
            </div>
            <label className="rec-field">
              <span>Özel süre (ms)</span>
              <input
                type="number"
                min={MIN_WAIT_MS}
                max={MAX_WAIT_MS}
                defaultValue={1000}
                onKeyDown={commitWait}
                disabled={busy}
              />
            </label>
          </div>

          {step.assertions.length ? (
            <div className="rec-block">
              <span className="rec-block-label">Doğrulama</span>
              <div className="rec-options">
                {step.assertions.map((option) => (
                  <button
                    key={option.id}
                    className="rec-option"
                    onClick={() => onAssert(step.id, option)}
                    disabled={busy}
                    title={option.detail}
                    type="button"
                  >
                    <Glyph name="shield" size={12} />
                    <span className="rec-option-label">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <label className="rec-check">
            <input
              type="checkbox"
              checked={step.continueOnFailure}
              onChange={(event) => onTolerate(step.id, event.target.checked)}
              disabled={busy}
            />
            <span>Hatada devam</span>
          </label>

          <div className="rec-step-actions">
            <IconButton
              name="up"
              title="Yukarı taşı"
              onClick={() => onMove(step.id, -1)}
              disabled={busy || step.order === 0}
              small
            />
            <IconButton
              name="down"
              title="Aşağı taşı"
              onClick={() => onMove(step.id, 1)}
              disabled={busy}
              small
            />
            <IconButton
              name="trash"
              title="Adımı sil"
              onClick={() => onRemove(step.id)}
              disabled={busy}
              small
              danger
            />
          </div>
        </div>
      ) : null}
    </div>
  )
})

export default function RecordPanel({
  blocked,
  onReport,
  onSaved
}: {
  blocked: boolean
  onReport: (report: RecordReport) => void
  onSaved: () => void
}): React.JSX.Element {
  const [view, setView] = useState<RecordView | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState('')

  const listRef = useRef<HTMLDivElement | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)
  const pinnedRef = useRef(true)
  const reportRef = useRef(onReport)
  const savedRef = useRef(onSaved)

  const status = view?.status ?? 'idle'
  const steps = useMemo(() => view?.steps ?? [], [view])
  const counters = view?.counters ?? null
  const report = view?.report ?? null

  useEffect(() => {
    reportRef.current = onReport
    savedRef.current = onSaved
  }, [onReport, onSaved])

  const say = useCallback((level: ReportLevel, text: string, detail?: string[]): void => {
    reportRef.current({ level, text, detail })
  }, [])

  const call = useCallback(
    async (
      label: string,
      task: () => Promise<{ ok: boolean; message: string; data: RecordView | null }>
    ): Promise<boolean> => {
      setBusy(true)
      try {
        const result = await task()
        if (!result.ok) {
          reportRef.current({ level: 'err', text: label + ': ' + result.message })
          return false
        }
        if (result.data) setView(result.data)
        return true
      } catch (error) {
        reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
        return false
      } finally {
        setBusy(false)
      }
    },
    []
  )

  useEffect(() => {
    const offUpdate = window.aftRecord.onUpdate((payload) => setView(payload))

    window.aftRecord
      .state()
      .then((result) => {
        if (result.ok && result.data) setView(result.data)
      })
      .catch((error: Error) => {
        reportRef.current({ level: 'err', text: 'Kayıt köprüsü hazır değil: ' + error.message })
      })

    return offUpdate
  }, [])

  useEffect(() => {
    if (!pinnedRef.current) return
    const list = listRef.current
    if (!list) return
    list.scrollTop = list.scrollHeight
  }, [steps.length])

  const onScroll = useCallback((): void => {
    const list = listRef.current
    if (!list) return
    pinnedRef.current = list.scrollHeight - list.scrollTop - list.clientHeight <= 40
  }, [])

  const start = useCallback(async (): Promise<void> => {
    const ok = await call('Kayıt başlatılamadı', () => window.aftRecord.start({}))
    if (ok) say('note', 'Kayıt başladı')
  }, [call, say])

  const stop = useCallback(async (): Promise<void> => {
    const ok = await call('Kayıt durdurulamadı', () => window.aftRecord.stop())
    if (ok) say('note', 'Kayıt durduruldu')
  }, [call, say])

  const pause = useCallback((): void => {
    void call('Kayıt duraklatılamadı', () => window.aftRecord.pause())
  }, [call])

  const resume = useCallback((): void => {
    void call('Kayıt sürdürülemedi', () => window.aftRecord.resume())
  }, [call])

  const discard = useCallback(async (): Promise<void> => {
    const ok = await call('Kayıt atılamadı', () => window.aftRecord.discard())
    if (ok) say('note', 'Kayıt atıldı')
  }, [call, say])

  const toggleHighlight = useCallback((): void => {
    const current = Boolean(view?.options.highlight)
    void call('Ayar güncellenemedi', () => window.aftRecord.options({ highlight: !current }))
  }, [call, view])

  const toggleScroll = useCallback((): void => {
    const current = Boolean(view?.options.captureScroll)
    void call('Ayar güncellenemedi', () => window.aftRecord.options({ captureScroll: !current }))
  }, [call, view])

  const toggleHover = useCallback((): void => {
    const current = Boolean(view?.options.captureHover)
    void call('Ayar güncellenemedi', () => window.aftRecord.options({ captureHover: !current }))
  }, [call, view])

  const edit = useCallback(async (request: RecordEditRequest, label: string): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.aftRecord.edit(request)
      if (!result.ok || !result.data) {
        reportRef.current({ level: 'err', text: label + ': ' + result.message })
        return
      }
      setView(result.data.view)
      if (!result.data.ok) reportRef.current({ level: 'err', text: result.data.message })
    } catch (error) {
      reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
    }
  }, [])

  const save = useCallback(async (): Promise<void> => {
    const title = nameRef.current?.value.trim() ?? ''
    setBusy(true)
    try {
      const result = await window.aftRecord.save({ meta: { title }, keepSession: false })
      if (!result.ok || !result.data) {
        reportRef.current({ level: 'err', text: 'Senaryo kaydedilemedi: ' + result.message })
        return
      }
      if (nameRef.current) nameRef.current.value = ''
      reportRef.current({
        level: 'ok',
        text: 'Senaryo kaydedildi: ' + result.data.scenario.title,
        detail: [
          'Adım ' + result.data.scenario.steps.length,
          'Uyarı ' + result.data.report.warnings.length,
          'dosya ' + result.data.file
        ]
      })
      savedRef.current()
    } catch (error) {
      reportRef.current({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setBusy(false)
    }
  }, [])

  const onToggle = useCallback((id: string): void => {
    setOpen((prev) => (prev === id ? '' : id))
  }, [])

  const onMove = useCallback(
    (id: string, offset: number): void => {
      void edit({ kind: 'move', stepId: id, offset }, 'Adım taşınamadı')
    },
    [edit]
  )

  const onRemove = useCallback(
    (id: string): void => {
      void edit({ kind: 'remove', stepId: id }, 'Adım silinemedi')
    },
    [edit]
  )

  const onRetitle = useCallback(
    (id: string, title: string): void => {
      void edit({ kind: 'retitle', stepId: id, title }, 'Başlık güncellenemedi')
    },
    [edit]
  )

  const onValue = useCallback(
    (id: string, text: string): void => {
      void edit({ kind: 'text', stepId: id, text }, 'Değer güncellenemedi')
    },
    [edit]
  )

  const onTarget = useCallback(
    (id: string, optionId: string): void => {
      void edit({ kind: 'target', stepId: id, optionId }, 'Hedef değiştirilemedi')
    },
    [edit]
  )

  const onWait = useCallback(
    (id: string, timeoutMs: number): void => {
      void edit({ kind: 'wait', stepId: id, timeoutMs }, 'Bekleme eklenemedi')
    },
    [edit]
  )

  const onAssert = useCallback(
    (id: string, option: AssertionOption): void => {
      void edit({ kind: 'assert', stepId: id, assertion: option.spec }, 'Doğrulama eklenemedi')
    },
    [edit]
  )

  const onTolerate = useCallback(
    (id: string, flag: boolean): void => {
      void edit({ kind: 'tolerate', stepId: id, flag }, 'Adım ayarı güncellenemedi')
    },
    [edit]
  )

  const clearAll = useCallback((): void => {
    void edit({ kind: 'clear' }, 'Adımlar silinemedi')
  }, [edit])

  const summary = useMemo(() => {
    if (!counters) return []
    return [
      { label: 'Adım', value: steps.length },
      { label: 'Elenen', value: counters.suppressed },
      { label: 'Birleşen', value: counters.merged },
      { label: 'Zayıf', value: counters.weak },
      { label: 'Tarama', value: counters.scans }
    ]
  }, [counters, steps.length])

  const live = status === 'recording' || status === 'paused'
  const savable = steps.length > 0 && Boolean(report?.ok)

  return (
    <section className="rec-panel">
      <div className="dock-block dock-bar">
        {status === 'recording' ? (
          <IconButton name="pause" title="Duraklat" onClick={pause} disabled={busy} small />
        ) : (
          <IconButton
            name={status === 'paused' ? 'play' : 'record'}
            title={status === 'paused' ? 'Sürdür' : 'Kaydı başlat'}
            onClick={status === 'paused' ? resume : () => void start()}
            disabled={busy || (blocked && status !== 'paused')}
            active={status !== 'paused'}
            small
          />
        )}
        <IconButton
          name="square"
          title="Kaydı durdur"
          onClick={() => void stop()}
          disabled={busy || !live}
          small
        />
        <span className="rec-bar-gap" />
        <IconButton
          name={view?.options.highlight ? 'eye' : 'eyeOff'}
          title="Kayıt vurgusu"
          onClick={toggleHighlight}
          disabled={busy || !live}
          active={Boolean(view?.options.highlight)}
          small
        />
        <IconButton
          name="down"
          title="Kaydırma adımlarını yakala"
          onClick={toggleScroll}
          disabled={busy || !live}
          active={Boolean(view?.options.captureScroll)}
          small
        />
        <IconButton
          name="target"
          title="İmleç adımları (Ctrl+H)"
          onClick={toggleHover}
          disabled={busy || !live}
          active={Boolean(view?.options.captureHover)}
          small
        />
        <IconButton
          name="trash"
          title="Kaydı at"
          onClick={() => void discard()}
          disabled={busy || status === 'idle'}
          small
          danger
        />
        <span className="rec-bar-push" />
        <span className={'rec-state ' + status}>{STATUS_LABELS[status]}</span>
      </div>

      {summary.length || view?.baseUrl || live ? (
        <div className="dock-block">
          {summary.length ? (
            <div className="dock-stats">
              {summary.map((item) => (
                <span key={item.label} className="stat-chip">
                  <b>{item.value}</b>
                  {item.label}
                </span>
              ))}
            </div>
          ) : null}
          {view?.baseUrl ? <span className="dock-meta">{shortUrl(view.baseUrl)}</span> : null}
          {live ? (
            <span className="dock-meta">
              {view?.options.captureHover
                ? 'İmleç ' +
                  view.options.hoverDwellMs +
                  ' ms beklerse adım açılır · Ctrl+H ile kapatın'
                : 'İmleç adımları kapalı · Ctrl+H ile açın'}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="rec-list" ref={listRef} onScroll={onScroll}>
        {steps.length ? (
          steps.map((step) => (
            <StepRow
              key={step.id}
              step={step}
              open={open === step.id}
              busy={busy}
              onToggle={onToggle}
              onMove={onMove}
              onRemove={onRemove}
              onRetitle={onRetitle}
              onValue={onValue}
              onTarget={onTarget}
              onWait={onWait}
              onAssert={onAssert}
              onTolerate={onTolerate}
            />
          ))
        ) : (
          <Empty
            glyph="record"
            text="Adım yok"
            hint="Kaydı başlatıp sahnedeki sayfayla etkileşime geçtiğinizde adımlar burada birikir."
          />
        )}
      </div>

      {report && (report.errors.length || report.warnings.length) ? (
        <div className="rec-report">
          {report.errors.map((issue, position) => (
            <div key={'e' + position} className="rec-issue bad">
              <Glyph name="alert" size={12} />
              {issue.path}: {issue.message}
            </div>
          ))}
          {report.warnings.slice(0, 4).map((issue, position) => (
            <div key={'w' + position} className="rec-issue warn">
              <Glyph name="info" size={12} />
              {issue.path}: {issue.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="dock-block">
        <label className="field">
          <span className="field-label">Senaryo adı</span>
          <input
            ref={nameRef}
            className="rec-name"
            key={view?.id ?? 'idle'}
            defaultValue={view?.title ?? ''}
            placeholder="giris-akisi"
            disabled={busy || !steps.length}
            spellCheck={false}
            aria-label="Senaryo adı"
          />
        </label>

        <div className="dock-actions">
          <TextButton
            glyph="save"
            label="Senaryo olarak kaydet"
            onClick={() => void save()}
            disabled={!savable}
            busy={busy}
            tone="primary"
          />
          <TextButton
            glyph="trash"
            label="Tümünü sil"
            onClick={clearAll}
            disabled={busy || !steps.length}
            tone="danger"
          />
        </div>
      </div>
    </section>
  )
}
