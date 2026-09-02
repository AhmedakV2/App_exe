import React, { memo, useMemo, useState } from 'react'
import type { ScenarioEntry } from '../../../main/scenario/ScenarioStore'
import type { RunRow, FragileStep } from '../../../main/data'
import type { HealingProposal } from '../../../main/identity'
import type { Activity, OutlineItem } from '../workbench'
import { KIND_GLYPH } from '../workbench'
import { Glyph } from '../icons'
import { Sym } from '../ui'
import { formatMs, formatShortDate, percent } from '../format'

const TITLES: Record<Activity, string> = {
  files: 'Gezgin',
  browser: 'Tarayıcı',
  runs: 'Koşumlar',
  identity: 'Kimlik',
  coverage: 'Kapsam',
  data: 'Veri'
}

function Section({
  label,
  count,
  open,
  onToggle,
  children
}: {
  label: string
  count?: number | string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <>
      <button className="sec" onClick={onToggle} type="button">
        <Glyph name={open ? 'chevronDown' : 'chevronRight'} size={12} />
        {label}
        {count !== undefined ? <span className="cnt">{count}</span> : null}
      </button>
      {open ? <div className="tree">{children}</div> : null}
    </>
  )
}

export default memo(function SidePanel({
  activity,
  scenarios,
  activeScenarioId,
  outline,
  outlineSel,
  runs,
  activeRunId,
  approvals,
  fragile,
  onOpenScenario,
  onNewScenario,
  onRunScenario,
  onOutline,
  onOpenRun,
  onOpenIdentity,
  onRefresh
}: {
  activity: Activity
  scenarios: ScenarioEntry[]
  activeScenarioId: string
  outline: OutlineItem[]
  outlineSel: string
  runs: RunRow[]
  activeRunId: string
  approvals: HealingProposal[]
  fragile: FragileStep[]
  onOpenScenario: (id: string, title: string) => void
  onNewScenario: () => void
  onRunScenario: (id: string) => void
  onOutline: (id: string) => void
  onOpenRun: (id: string) => void
  onOpenIdentity: (tab: string) => void
  onRefresh: () => void
}): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})

  const toggle = (key: string): void => setClosed((prev) => ({ ...prev, [key]: !prev[key] }))
  const isOpen = (key: string): boolean => !closed[key]

  const rows = useMemo(() => {
    const text = filter.trim().toLowerCase()
    if (!text) return scenarios
    return scenarios.filter((entry) => entry.title.toLowerCase().includes(text))
  }, [filter, scenarios])

  const grouped = useMemo(() => {
    const map = new Map<string, RunRow[]>()
    for (const row of runs) {
      const day = new Date(row.startedAt)
      const key = day.getFullYear() + '-' + (day.getMonth() + 1) + '-' + day.getDate()
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return [...map.entries()]
  }, [runs])

  const dayLabel = (key: string): string => {
    const now = new Date()
    const today = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate()
    const y = new Date(now.getTime() - 86400000)
    const yesterday = y.getFullYear() + '-' + (y.getMonth() + 1) + '-' + y.getDate()
    if (key === today) return 'Bugün'
    if (key === yesterday) return 'Dün'
    const [, m, d] = key.split('-')
    return d + '.' + String(m).padStart(2, '0')
  }

  const showScenarios = activity === 'files' || activity === 'browser'

  return (
    <>
      <div className="side-hd">
        {TITLES[activity]}
        <span className="push" />
        {showScenarios ? (
          <button className="ib" title="Yeni senaryo" onClick={onNewScenario} type="button">
            <Glyph name="plus" size={14} />
          </button>
        ) : null}
        <button className="ib" title="Yenile" onClick={onRefresh} type="button">
          <Glyph name="reload" size={13} />
        </button>
      </div>

      {showScenarios ? (
        <div className="side-search">
          <div className="search">
            <Glyph name="search" size={13} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Senaryo filtrele"
              spellCheck={false}
              aria-label="Senaryo filtresi"
            />
          </div>
        </div>
      ) : null}

      <div className="side-body">
        {showScenarios ? (
          <>
            <Section
              label="Senaryolar"
              count={scenarios.length}
              open={isOpen('scenarios')}
              onToggle={() => toggle('scenarios')}
            >
              {rows.length ? (
                rows.map((entry) => (
                  <button
                    key={entry.id}
                    className={'tr-row' + (entry.id === activeScenarioId ? ' sel' : '')}
                    onClick={() => onOpenScenario(entry.id, entry.title)}
                    onDoubleClick={() => onRunScenario(entry.id)}
                    title={entry.file}
                    type="button"
                  >
                    <Glyph name="file" size={14} />
                    <span className="lb">{entry.title}</span>
                    <span className="st">{entry.steps}</span>
                  </button>
                ))
              ) : (
                <div className="side-empty">Senaryo yok</div>
              )}
            </Section>

            <Section
              label="Anahat"
              count={outline.length}
              open={isOpen('outline')}
              onToggle={() => toggle('outline')}
            >
              {outline.length ? (
                outline.map((item) => (
                  <button
                    key={item.id}
                    className={
                      'tr-row' + (item.depth ? ' d2' : '') + (item.id === outlineSel ? ' sel' : '')
                    }
                    onClick={() => onOutline(item.id)}
                    type="button"
                  >
                    <Glyph name={KIND_GLYPH[item.kind] ?? 'file'} size={13} />
                    <span className="lb">
                      {item.number} {item.title}
                    </span>
                  </button>
                ))
              ) : (
                <div className="side-empty">Açık senaryo yok</div>
              )}
            </Section>
          </>
        ) : null}

        {activity === 'runs' || showScenarios ? (
          grouped.length ? (
            grouped.map(([day, list]) => (
              <Section
                key={day}
                label={dayLabel(day)}
                count={list.length}
                open={isOpen('day:' + day)}
                onToggle={() => toggle('day:' + day)}
              >
                {list.map((row) => (
                  <button
                    key={row.id}
                    className={'tr-row' + (row.id === activeRunId ? ' sel' : '')}
                    onClick={() => onOpenRun(row.id)}
                    type="button"
                  >
                    <Sym tone={row.ok ? 'ok' : row.status === 'failed' ? 'bad' : 'warn'} />
                    <span className="lb">{row.scenarioTitle}</span>
                    <span className="st">
                      {row.passed}/{row.steps} · {formatMs(row.totalMs)}
                    </span>
                  </button>
                ))}
              </Section>
            ))
          ) : (
            <Section
              label="Koşumlar"
              count={0}
              open={isOpen('runs')}
              onToggle={() => toggle('runs')}
            >
              <div className="side-empty">Koşum kaydı yok</div>
            </Section>
          )
        ) : null}

        {activity === 'identity' ? (
          <>
            <Section
              label="Onay bekleyen"
              count={approvals.length}
              open={isOpen('approvals')}
              onToggle={() => toggle('approvals')}
            >
              {approvals.length ? (
                approvals.map((entry) => (
                  <button
                    key={entry.descriptorId}
                    className="tr-row"
                    onClick={() => onOpenIdentity('approvals')}
                    type="button"
                  >
                    <Sym tone={entry.decision === 'blocked' ? 'bad' : 'warn'} />
                    <span className="lb">{entry.next.target.name || entry.next.target.tag}</span>
                    <span className="st">{percent(entry.confidence)}</span>
                  </button>
                ))
              ) : (
                <div className="side-empty">Bekleyen onay yok</div>
              )}
            </Section>
            <Section
              label="Kırılgan adımlar"
              count={fragile.length}
              open={isOpen('fragile')}
              onToggle={() => toggle('fragile')}
            >
              {fragile.length ? (
                fragile.map((entry) => (
                  <button
                    key={entry.descriptorId}
                    className="tr-row"
                    onClick={() => onOpenIdentity('fragile')}
                    type="button"
                  >
                    <Sym tone={entry.missing ? 'bad' : 'warn'} />
                    <span className="lb">{entry.title}</span>
                    <span className="st">{percent(entry.meanConfidence)}</span>
                  </button>
                ))
              ) : (
                <div className="side-empty">Kırılgan adım yok</div>
              )}
            </Section>
            <button className="sec" onClick={() => onOpenIdentity('catalog')} type="button">
              <Glyph name="chevronRight" size={12} />
              Katalog
            </button>
            <button className="sec" onClick={() => onOpenIdentity('strategies')} type="button">
              <Glyph name="chevronRight" size={12} />
              Strateji istatistikleri
            </button>
          </>
        ) : null}

        {activity === 'coverage' || activity === 'data' ? (
          <div className="side-empty">
            {activity === 'coverage'
              ? 'Kapsam raporu editör alanında görüntülenir.'
              : 'Veri deposu editör alanında görüntülenir.'}
          </div>
        ) : null}

        {showScenarios && runs.length ? (
          <div className="side-empty">son koşum {formatShortDate(runs[0].startedAt)}</div>
        ) : null}
      </div>
    </>
  )
})
