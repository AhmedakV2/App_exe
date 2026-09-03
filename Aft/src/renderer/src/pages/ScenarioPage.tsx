import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScenarioEntry, ScenarioFolder } from '../../../main/scenario/ScenarioStore'
import type {
  Assertion,
  AssertionKind,
  Scenario,
  ScenarioDefaults,
  ScenarioReport,
  ScenarioStep,
  StepKind
} from '../../../main/scenario/types'
import { ASSERTION_KINDS, DEFAULT_DEFAULTS, SCENARIO_VERSION } from '../../../main/scenario/types'
import { Glyph, IconButton } from '../icons'
import { Card, Empty, Field, Menu, PageHead, Pill, Segmented, TextButton, Toggle } from '../ui'
import type { MenuItem } from '../ui'
import { percent, shortUrl } from '../format'
import ScenarioTree from '../parts/ScenarioTree'
import type { TreeTarget } from '../parts/ScenarioTree'
import StepTree from '../parts/StepTree'
import DefaultsSheet from '../parts/DefaultsSheet'
import PromptSheet from '../parts/PromptSheet'
import type { Report } from '../report'

const ADD_KINDS: StepKind[] = ['navigate', 'wait', 'press-key', 'scroll', 'assert']

const VIEWS = [
  { id: 'steps', label: 'Adımlar' },
  { id: 'json', label: 'JSON' }
]

type ViewId = 'steps' | 'json'

type Ask = {
  kind: 'folder-add' | 'folder-rename' | 'folder-remove' | 'scenario-remove'
  id: string
  title: string
  label?: string
  message?: string
  value: string | null
  confirmLabel: string
  danger?: boolean
}

type MenuState = { target: TreeTarget; x: number; y: number }

function uid(prefix: string): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function blankStep(kind: StepKind, title: string): ScenarioStep {
  return {
    id: uid('st-'),
    kind,
    title,
    target: null,
    assertion:
      kind === 'assert'
        ? {
            kind: 'url-matches',
            target: null,
            expected: '',
            attribute: '',
            count: 0,
            soft: false,
            message: ''
          }
        : null,
    condition: null,
    steps: [],
    text: '',
    key: '',
    url: '',
    deltaY: 0,
    optionValue: '',
    files: [],
    timeoutMs: DEFAULT_DEFAULTS.stepTimeoutMs,
    retries: DEFAULT_DEFAULTS.retries,
    scanLevel: null,
    mode: null,
    continueOnFailure: false,
    allowLowConfidence: false,
    expectState: null
  }
}

function blankScenario(baseUrl: string): Scenario {
  const first = blankStep('navigate', 'Adrese git')
  first.url = baseUrl
  return {
    version: SCENARIO_VERSION,
    id: uid('sc-'),
    title: 'Yeni senaryo',
    description: '',
    baseUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    defaults: { ...DEFAULT_DEFAULTS },
    steps: [first]
  }
}

function mapSteps(steps: ScenarioStep[], fn: (step: ScenarioStep) => ScenarioStep): ScenarioStep[] {
  return steps.map((step) => {
    const next = fn(step)
    if (!next.steps.length) return next
    return { ...next, steps: mapSteps(next.steps, fn) }
  })
}

function flatSteps(steps: ScenarioStep[], depth = 0): { step: ScenarioStep; depth: number }[] {
  const out: { step: ScenarioStep; depth: number }[] = []
  for (const step of steps) {
    out.push({ step, depth })
    if (step.steps.length) out.push(...flatSteps(step.steps, depth + 1))
  }
  return out
}

function dropStep(steps: ScenarioStep[], id: string): ScenarioStep[] {
  return steps
    .filter((step) => step.id !== id)
    .map((step) => (step.steps.length ? { ...step, steps: dropStep(step.steps, id) } : step))
}

function shiftStep(steps: ScenarioStep[], id: string, offset: number): ScenarioStep[] {
  const index = steps.findIndex((step) => step.id === id)
  if (index >= 0) {
    const target = index + offset
    if (target < 0 || target >= steps.length) return steps
    const next = steps.slice()
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    return next
  }
  return steps.map((step) =>
    step.steps.length ? { ...step, steps: shiftStep(step.steps, id, offset) } : step
  )
}

function findStep(steps: ScenarioStep[], id: string): ScenarioStep | null {
  for (const step of steps) {
    if (step.id === id) return step
    const nested = findStep(step.steps, id)
    if (nested) return nested
  }
  return null
}

function holdsStep(step: ScenarioStep, id: string): boolean {
  return step.id === id || step.steps.some((child) => holdsStep(child, id))
}

function placeStep(
  steps: ScenarioStep[],
  targetId: string,
  item: ScenarioStep,
  after: boolean
): ScenarioStep[] {
  const index = steps.findIndex((step) => step.id === targetId)
  if (index >= 0) {
    const next = steps.slice()
    next.splice(index + (after ? 1 : 0), 0, item)
    return next
  }
  return steps.map((step) =>
    step.steps.length ? { ...step, steps: placeStep(step.steps, targetId, item, after) } : step
  )
}

function valueLabel(kind: StepKind): string {
  if (kind === 'type' || kind === 'clear-type') return 'Metin'
  if (kind === 'press-key') return 'Tuş'
  if (kind === 'navigate') return 'Adres'
  if (kind === 'select-option') return 'Seçenek'
  if (kind === 'scroll') return 'Kaydırma'
  return ''
}

function readScenario(text: string, id: string): Scenario {
  const parsed = JSON.parse(text) as Partial<Scenario>
  if (!parsed || typeof parsed !== 'object') throw new Error('Nesne bekleniyor')
  if (!Array.isArray(parsed.steps)) throw new Error('steps dizisi eksik')
  if (parsed.id !== id) throw new Error('Senaryo kimliği değiştirilemez')
  return parsed as Scenario
}

export default function ScenarioPage({
  revision,
  busy,
  baseUrl,
  onReport,
  onRun,
  onChanged
}: {
  revision: number
  busy: boolean
  baseUrl: string
  onReport: (report: Report) => void
  onRun: (scenarioId: string) => void
  onChanged: () => void
}): React.JSX.Element {
  const [entries, setEntries] = useState<ScenarioEntry[]>([])
  const [folders, setFolders] = useState<ScenarioFolder[]>([])
  const [selected, setSelected] = useState('')
  const [draft, setDraft] = useState<Scenario | null>(null)
  const [draftPlace, setDraftPlace] = useState('')
  const [report, setReport] = useState<ScenarioReport | null>(null)
  const [stepId, setStepId] = useState('')
  const [filter, setFilter] = useState('')
  const [dirty, setDirty] = useState(false)
  const [working, setWorking] = useState(false)
  const [addKind, setAddKind] = useState<StepKind>('navigate')
  const [view, setView] = useState<ViewId>('steps')
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [folder, setFolder] = useState('')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [defaultsOpen, setDefaultsOpen] = useState(false)

  const draftRef = useRef<Scenario | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const place = useMemo(() => {
    if (!selected) return draftPlace
    return entries.find((entry) => entry.id === selected)?.folder ?? draftPlace
  }, [draftPlace, entries, selected])

  const steps = useMemo(() => (draft ? flatSteps(draft.steps) : []), [draft])
  const step = useMemo(
    () => steps.find((item) => item.step.id === stepId)?.step ?? null,
    [stepId, steps]
  )

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await window.aftPlayback.list()
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Senaryo listesi alınamadı: ' + result.message })
        return
      }
      setEntries(result.data.entries)
      setFolders(result.data.folders)
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    }
  }, [onReport])

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timer)
  }, [load, revision])

  const seed = view + '|' + (draft?.id ?? '')

  useEffect(() => {
    const current = draftRef.current
    setJsonText(current ? JSON.stringify(current, null, 2) : '')
    setJsonError('')
  }, [seed])

  const open = useCallback(
    async (id: string): Promise<void> => {
      setWorking(true)
      try {
        const result = await window.aftPlayback.get(id)
        if (!result.ok || !result.data) {
          onReport({ level: 'err', text: 'Senaryo okunamadı: ' + result.message })
          return
        }
        setSelected(id)
        setDraft(result.data.scenario)
        setReport(result.data.report)
        setStepId(result.data.scenario.steps[0]?.id ?? '')
        setDirty(false)
      } catch (error) {
        onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
      } finally {
        setWorking(false)
      }
    },
    [onReport]
  )

  const patch = useCallback((change: Partial<Scenario>): void => {
    setDraft((prev) => (prev ? { ...prev, ...change } : prev))
    setDirty(true)
  }, [])

  const patchDefaults = useCallback((change: Partial<ScenarioDefaults>): void => {
    setDraft((prev) => (prev ? { ...prev, defaults: { ...prev.defaults, ...change } } : prev))
    setDirty(true)
  }, [])

  const patchStep = useCallback((id: string, change: Partial<ScenarioStep>): void => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            steps: mapSteps(prev.steps, (item) => (item.id === id ? { ...item, ...change } : item))
          }
        : prev
    )
    setDirty(true)
  }, [])

  const patchAssertion = useCallback((id: string, change: Partial<Assertion>): void => {
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            steps: mapSteps(prev.steps, (item) =>
              item.id === id && item.assertion
                ? { ...item, assertion: { ...item.assertion, ...change } }
                : item
            )
          }
        : prev
    )
    setDirty(true)
  }, [])

  const removeStep = useCallback(
    (id: string): void => {
      setDraft((prev) => (prev ? { ...prev, steps: dropStep(prev.steps, id) } : prev))
      setDirty(true)
      if (stepId === id) setStepId('')
    },
    [stepId]
  )

  const moveStep = useCallback((id: string, offset: number): void => {
    setDraft((prev) => (prev ? { ...prev, steps: shiftStep(prev.steps, id, offset) } : prev))
    setDirty(true)
  }, [])

  const dragStep = useCallback((dragId: string, targetId: string, after: boolean): void => {
    setDraft((prev) => {
      if (!prev) return prev

      const moving = findStep(prev.steps, dragId)
      const target = findStep(prev.steps, targetId)
      if (!moving || !target || holdsStep(moving, targetId)) return prev

      return { ...prev, steps: placeStep(dropStep(prev.steps, dragId), targetId, moving, after) }
    })
    setStepId(dragId)
    setDirty(true)
  }, [])

  const create = useCallback((): void => {
    const draftScenario = blankScenario(baseUrl)
    setSelected('')
    setDraft(draftScenario)
    setDraftPlace(folder)
    setReport(null)
    setStepId(draftScenario.steps[0].id)
    setView('steps')
    setDirty(true)
  }, [baseUrl, folder])

  const addStep = useCallback((): void => {
    const item = blankStep(addKind, addKind)
    setDraft((prev) => (prev ? { ...prev, steps: prev.steps.concat(item) } : prev))
    setStepId(item.id)
    setView('steps')
    setDirty(true)
  }, [addKind])

  const applyJson = useCallback((text: string): void => {
    setJsonText(text)

    const current = draftRef.current
    if (!current) return

    try {
      const parsed = readScenario(text, current.id)
      setDraft(parsed)
      setDirty(true)
      setJsonError('')
    } catch (error) {
      setJsonError((error as Error).message)
    }
  }, [])

  const validate = useCallback(async (): Promise<void> => {
    if (!draft) return
    setWorking(true)
    try {
      const result = await window.aftPlayback.validate(draft)
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Doğrulama başarısız: ' + result.message })
        return
      }
      setReport(result.data.report)
      onReport({
        level: result.data.report.ok ? 'ok' : 'err',
        text: result.data.report.ok ? 'Senaryo doğrulandı' : 'Senaryo geçersiz',
        detail: result.data.report.errors
          .slice(0, 4)
          .map((issue) => issue.path + ': ' + issue.message)
      })
    } finally {
      setWorking(false)
    }
  }, [draft, onReport])

  const save = useCallback(async (): Promise<void> => {
    if (!draft) return
    setWorking(true)
    try {
      const result = await window.aftPlayback.save({ ...draft, updatedAt: Date.now() }, place)
      if (!result.ok || !result.data) {
        onReport({ level: 'err', text: 'Senaryo kaydedilemedi: ' + result.message })
        return
      }
      setDraft(result.data.scenario)
      setSelected(result.data.scenario.id)
      setReport(result.data.report)
      setDirty(false)
      onReport({ level: 'ok', text: 'Senaryo kaydedildi: ' + result.data.scenario.title })
      await load()
      onChanged()
    } catch (error) {
      onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
    } finally {
      setWorking(false)
    }
  }, [draft, load, onChanged, onReport, place])

  const remove = useCallback(
    async (id: string): Promise<void> => {
      if (!id) return
      setWorking(true)
      try {
        const result = await window.aftPlayback.remove(id)
        if (!result.ok) {
          onReport({ level: 'err', text: 'Senaryo silinemedi: ' + result.message })
          return
        }
        if (id === selected) {
          setSelected('')
          setDraft(null)
          setReport(null)
          setStepId('')
          setDirty(false)
        }
        onReport({ level: 'note', text: 'Senaryo silindi' })
        await load()
        onChanged()
      } finally {
        setWorking(false)
      }
    },
    [load, onChanged, onReport, selected]
  )

  const moveScenario = useCallback(
    async (id: string, target: string): Promise<void> => {
      setWorking(true)
      try {
        const result = await window.aftPlayback.move({ scenarioId: id, folder: target })
        if (!result.ok) {
          onReport({ level: 'err', text: 'Senaryo taşınamadı: ' + result.message })
          return
        }
        await load()
        onChanged()
      } catch (error) {
        onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
      } finally {
        setWorking(false)
      }
    },
    [load, onChanged, onReport]
  )

  const runAsk = useCallback(
    async (request: Ask, value: string): Promise<void> => {
      setWorking(true)
      try {
        if (request.kind === 'folder-add') {
          const result = await window.aftPlayback.folderAdd({ parentId: request.id, name: value })
          if (!result.ok || !result.data) {
            onReport({ level: 'err', text: 'Klasör açılamadı: ' + result.message })
            return
          }
          setFolder(result.data.folder.id)
          onReport({ level: 'ok', text: 'Klasör açıldı: ' + result.data.folder.name })
        }

        if (request.kind === 'folder-rename') {
          const result = await window.aftPlayback.folderRename({ id: request.id, name: value })
          if (!result.ok || !result.data) {
            onReport({ level: 'err', text: 'Klasör adlandırılamadı: ' + result.message })
            return
          }
          setFolder(result.data.folder.id)
          onReport({ level: 'ok', text: 'Klasör adlandırıldı: ' + result.data.folder.name })
        }

        if (request.kind === 'folder-remove') {
          const result = await window.aftPlayback.folderRemove(request.id)
          if (!result.ok) {
            onReport({ level: 'err', text: 'Klasör silinemedi: ' + result.message })
            return
          }
          if (folder === request.id || folder.startsWith(request.id + '/')) setFolder('')
          onReport({ level: 'note', text: 'Klasör silindi' })
        }

        await load()
        onChanged()
      } catch (error) {
        onReport({ level: 'err', text: 'Köprü hatası: ' + (error as Error).message })
      } finally {
        setWorking(false)
      }
    },
    [folder, load, onChanged, onReport]
  )

  const submitAsk = useCallback(
    (value: string): void => {
      const request = ask
      setAsk(null)
      if (!request) return

      if (request.kind === 'scenario-remove') {
        void remove(request.id)
        return
      }
      void runAsk(request, value)
    },
    [ask, remove, runAsk]
  )

  const openMenu = useCallback((target: TreeTarget, x: number, y: number): void => {
    setMenu({ target, x, y })
  }, [])

  const menuItems = useMemo((): MenuItem[] => {
    if (!menu) return []

    if (menu.target.kind === 'scenario') {
      return [
        { id: 'open', label: 'Aç', glyph: 'file' },
        { id: 'run', label: 'Çalıştır', glyph: 'play' },
        { id: 'defaults', label: 'Varsayılan ayarlar', glyph: 'sliders', split: true },
        { id: 'remove', label: 'Sil', glyph: 'trash', danger: true, split: true }
      ]
    }

    if (menu.target.kind === 'folder') {
      const target = folders.find((item) => item.id === menu.target.id)
      return [
        { id: 'scenario-add', label: 'Yeni senaryo', glyph: 'plus' },
        {
          id: 'module-add',
          label: 'Yeni modül',
          glyph: 'module',
          disabled: target?.kind !== 'project'
        },
        { id: 'rename', label: 'Yeniden adlandır', glyph: 'edit', split: true },
        { id: 'remove', label: 'Sil', glyph: 'trash', danger: true }
      ]
    }

    return [
      { id: 'project-add', label: 'Yeni proje', glyph: 'folder' },
      { id: 'scenario-add', label: 'Yeni senaryo', glyph: 'plus' }
    ]
  }, [folders, menu])

  const pickMenu = useCallback(
    (id: string): void => {
      const target = menu?.target
      setMenu(null)
      if (!target) return

      if (target.kind === 'scenario') {
        if (id === 'open') void open(target.id)
        if (id === 'run') onRun(target.id)
        if (id === 'defaults') {
          if (target.id === selected) setDefaultsOpen(true)
          else void open(target.id).then(() => setDefaultsOpen(true))
        }
        if (id === 'remove') {
          const entry = entries.find((item) => item.id === target.id)
          setAsk({
            kind: 'scenario-remove',
            id: target.id,
            title: 'Senaryo silinsin mi?',
            message: (entry?.title ?? target.id) + ' kalıcı olarak silinecek.',
            value: null,
            confirmLabel: 'Sil',
            danger: true
          })
        }
        return
      }

      if (id === 'project-add') {
        setAsk({
          kind: 'folder-add',
          id: '',
          title: 'Yeni proje',
          label: 'Proje adı',
          value: 'Yeni proje',
          confirmLabel: 'Oluştur'
        })
        return
      }

      if (id === 'module-add') {
        setAsk({
          kind: 'folder-add',
          id: target.id,
          title: 'Yeni modül',
          label: 'Modül adı',
          value: 'Yeni modül',
          confirmLabel: 'Oluştur'
        })
        return
      }

      if (id === 'scenario-add') {
        setFolder(target.id)
        const draftScenario = blankScenario(baseUrl)
        setSelected('')
        setDraft(draftScenario)
        setDraftPlace(target.id)
        setReport(null)
        setStepId(draftScenario.steps[0].id)
        setView('steps')
        setDirty(true)
        return
      }

      const known = folders.find((item) => item.id === target.id)
      if (!known) return

      if (id === 'rename') {
        setAsk({
          kind: 'folder-rename',
          id: known.id,
          title: known.kind === 'module' ? 'Modülü adlandır' : 'Projeyi adlandır',
          label: 'Ad',
          value: known.name,
          confirmLabel: 'Kaydet'
        })
        return
      }

      if (id === 'remove') {
        setAsk({
          kind: 'folder-remove',
          id: known.id,
          title: known.kind === 'module' ? 'Modül silinsin mi?' : 'Proje silinsin mi?',
          message: known.name + ' ve içindeki tüm senaryolar kalıcı olarak silinecek.',
          value: null,
          confirmLabel: 'Sil',
          danger: true
        })
      }
    },
    [baseUrl, entries, folders, menu, onRun, open, selected]
  )

  const active = useMemo(
    () => folders.find((item) => item.id === folder) ?? null,
    [folder, folders]
  )

  const locked = working || busy

  return (
    <div className="page">
      <PageHead
        title="Senaryolar"
        meta={
          draft ? (
            <>
              <Pill tone={report?.ok ? 'ok' : 'bad'}>
                {report?.ok ? 'doğrulandı' : (report?.errors.length ?? 0) + ' hata'}
              </Pill>
              {report?.warnings.length ? (
                <Pill tone="warn">{report.warnings.length} uyarı</Pill>
              ) : null}
              {dirty ? <Pill tone="accent">kaydedilmedi</Pill> : null}
            </>
          ) : null
        }
        actions={
          <>
            <TextButton glyph="plus" label="Yeni" onClick={create} disabled={locked} />
            <TextButton
              glyph="shield"
              label="Doğrula"
              onClick={() => void validate()}
              disabled={!draft || locked}
            />
            <TextButton
              glyph="save"
              label="Kaydet"
              onClick={() => void save()}
              disabled={!draft || locked || !dirty}
              tone="primary"
            />
            <TextButton
              glyph="play"
              label="Çalıştır"
              onClick={() => onRun(selected)}
              disabled={!selected || locked || dirty}
            />
            <TextButton
              glyph="trash"
              label="Sil"
              onClick={() =>
                setAsk({
                  kind: 'scenario-remove',
                  id: selected,
                  title: 'Senaryo silinsin mi?',
                  message: (draft?.title ?? selected) + ' kalıcı olarak silinecek.',
                  value: null,
                  confirmLabel: 'Sil',
                  danger: true
                })
              }
              disabled={!selected || locked}
              tone="danger"
            />
          </>
        }
      />

      <div className="page-body cols-3">
        <Card
          label="Kütüphane"
          actions={
            <>
              <IconButton
                name="folder"
                title="Yeni proje"
                onClick={() =>
                  setAsk({
                    kind: 'folder-add',
                    id: '',
                    title: 'Yeni proje',
                    label: 'Proje adı',
                    value: 'Yeni proje',
                    confirmLabel: 'Oluştur'
                  })
                }
                disabled={locked}
                small
              />
              <IconButton
                name="module"
                title="Yeni modül"
                onClick={() =>
                  setAsk({
                    kind: 'folder-add',
                    id: folder,
                    title: 'Yeni modül',
                    label: 'Modül adı',
                    value: 'Yeni modül',
                    confirmLabel: 'Oluştur'
                  })
                }
                disabled={locked || active?.kind !== 'project'}
                small
              />
              <IconButton name="reload" title="Yenile" onClick={() => void load()} small />
            </>
          }
          scroll
        >
          <div className="search">
            <Glyph name="search" size={13} />
            <input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Senaryo ara"
              spellCheck={false}
              aria-label="Senaryo filtresi"
            />
          </div>

          <ScenarioTree
            entries={entries}
            folders={folders}
            filter={filter}
            selected={selected}
            activeFolder={folder}
            disabled={locked}
            onOpen={(id) => void open(id)}
            onPickFolder={setFolder}
            onMove={(id, target) => void moveScenario(id, target)}
            onMenu={openMenu}
          />
        </Card>

        <Card
          label="Senaryo"
          lead={
            draft ? (
              <span className="head-group">
                <select
                  className="picker slim"
                  value={addKind}
                  onChange={(event) => setAddKind(event.target.value as StepKind)}
                  disabled={locked}
                  aria-label="Adım türü"
                >
                  {ADD_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
                <IconButton
                  name="plus"
                  title="Adım ekle"
                  onClick={addStep}
                  disabled={locked}
                  small
                />
              </span>
            ) : null
          }
          actions={
            draft ? (
              <Segmented
                items={VIEWS}
                value={view}
                onPick={(id) => setView(id as ViewId)}
                disabled={locked}
              />
            ) : null
          }
          scroll
          grow
        >
          {draft ? (
            <>
              <div className="grid-2">
                <Field label="Başlık">
                  <input
                    value={draft.title}
                    onChange={(event) => patch({ title: event.target.value })}
                    spellCheck={false}
                  />
                </Field>
                <Field label="Başlangıç adresi">
                  <input
                    value={draft.baseUrl}
                    onChange={(event) => patch({ baseUrl: event.target.value })}
                    spellCheck={false}
                  />
                </Field>
              </div>

              {view === 'steps' ? (
                <StepTree
                  steps={steps}
                  selected={stepId}
                  disabled={locked}
                  onSelect={setStepId}
                  onMove={dragStep}
                />
              ) : (
                <>
                  <textarea
                    className="json-edit"
                    value={jsonText}
                    onChange={(event) => applyJson(event.target.value)}
                    spellCheck={false}
                    aria-label="Senaryo JSON"
                  />
                  {jsonError ? (
                    <div className="issue bad">
                      <Glyph name="alert" size={12} />
                      {jsonError}
                    </div>
                  ) : null}
                </>
              )}

              {report && report.errors.length ? (
                <div className="issues">
                  {report.errors.slice(0, 6).map((issue, index) => (
                    <div key={index} className="issue bad">
                      <Glyph name="alert" size={12} />
                      {issue.path}: {issue.message}
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <Empty glyph="file" text="Senaryo seçilmedi" />
          )}
        </Card>

        <Card
          label="Adım ayarı"
          actions={
            draft ? (
              <IconButton
                name="sliders"
                title="Senaryo varsayılanları"
                onClick={() => setDefaultsOpen(true)}
                small
              />
            ) : null
          }
          scroll
        >
          {draft && step ? (
            <>
              <div className="step-actions">
                <IconButton
                  name="up"
                  title="Yukarı"
                  onClick={() => moveStep(step.id, -1)}
                  disabled={locked}
                  small
                />
                <IconButton
                  name="down"
                  title="Aşağı"
                  onClick={() => moveStep(step.id, 1)}
                  disabled={locked}
                  small
                />
                <IconButton
                  name="trash"
                  title="Sil"
                  onClick={() => removeStep(step.id)}
                  disabled={locked}
                  small
                  danger
                />
              </div>

              <Field label="Başlık">
                <input
                  value={step.title}
                  onChange={(event) => patchStep(step.id, { title: event.target.value })}
                  spellCheck={false}
                />
              </Field>

              {step.target ? (
                <div className="kv">
                  <span className="kv-key">hedef</span>
                  <span className="kv-val">{step.target.label || step.target.kind}</span>
                  <span className="kv-key">tür</span>
                  <span className="kv-val">{step.target.kind}</span>
                  {step.target.descriptor ? (
                    <>
                      <span className="kv-key">kalite</span>
                      <span className="kv-val">
                        {percent(step.target.descriptor.quality.score)}
                      </span>
                      <span className="kv-key">strateji</span>
                      <span className="kv-val">
                        {step.target.descriptor.strategies.map((entry) => entry.kind).join(', ')}
                      </span>
                    </>
                  ) : null}
                </div>
              ) : null}

              {valueLabel(step.kind) ? (
                <Field label={valueLabel(step.kind)}>
                  <input
                    value={
                      step.kind === 'press-key'
                        ? step.key
                        : step.kind === 'navigate'
                          ? step.url
                          : step.kind === 'select-option'
                            ? step.optionValue
                            : step.kind === 'scroll'
                              ? String(step.deltaY)
                              : step.text
                    }
                    onChange={(event) => {
                      const value = event.target.value
                      if (step.kind === 'press-key') patchStep(step.id, { key: value })
                      else if (step.kind === 'navigate') patchStep(step.id, { url: value })
                      else if (step.kind === 'select-option')
                        patchStep(step.id, { optionValue: value })
                      else if (step.kind === 'scroll')
                        patchStep(step.id, { deltaY: Number(value) || 0 })
                      else patchStep(step.id, { text: value })
                    }}
                    spellCheck={false}
                  />
                </Field>
              ) : null}

              {step.assertion ? (
                <>
                  <Field label="Doğrulama">
                    <select
                      value={step.assertion.kind}
                      onChange={(event) =>
                        patchAssertion(step.id, { kind: event.target.value as AssertionKind })
                      }
                    >
                      {ASSERTION_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Beklenen">
                    <input
                      value={step.assertion.expected}
                      onChange={(event) =>
                        patchAssertion(step.id, { expected: event.target.value })
                      }
                      spellCheck={false}
                    />
                  </Field>
                  <Toggle
                    label="Yumuşak doğrulama"
                    checked={step.assertion.soft}
                    onChange={(next) => patchAssertion(step.id, { soft: next })}
                  />
                </>
              ) : null}

              <div className="grid-2">
                <Field label="Zaman aşımı">
                  <input
                    type="number"
                    value={step.timeoutMs}
                    onChange={(event) =>
                      patchStep(step.id, { timeoutMs: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
                <Field label="Deneme">
                  <input
                    type="number"
                    value={step.retries}
                    onChange={(event) =>
                      patchStep(step.id, { retries: Number(event.target.value) || 0 })
                    }
                  />
                </Field>
              </div>

              <Toggle
                label="Hatada devam et"
                checked={step.continueOnFailure}
                onChange={(next) => patchStep(step.id, { continueOnFailure: next })}
              />
              <Toggle
                label="Düşük güvene izin ver"
                checked={step.allowLowConfidence}
                onChange={(next) => patchStep(step.id, { allowLowConfidence: next })}
              />

              <div className="kv">
                <span className="kv-key">şema</span>
                <span className="kv-val mono">{draft.version}</span>
                <span className="kv-key">kimlik</span>
                <span className="kv-val mono">{draft.id}</span>
                <span className="kv-key">adres</span>
                <span className="kv-val mono">{shortUrl(draft.baseUrl)}</span>
                <span className="kv-key">konum</span>
                <span className="kv-val mono">{place || 'kök'}</span>
              </div>
            </>
          ) : (
            <Empty glyph="sliders" text="Adım seçilmedi" />
          )}
        </Card>
      </div>

      {menu ? (
        <Menu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onPick={pickMenu}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {defaultsOpen && draft ? (
        <DefaultsSheet
          title={draft.title}
          defaults={draft.defaults}
          disabled={locked}
          onPatch={patchDefaults}
          onClose={() => setDefaultsOpen(false)}
        />
      ) : null}

      {ask ? (
        <PromptSheet
          title={ask.title}
          label={ask.label}
          value={ask.value}
          message={ask.message}
          confirmLabel={ask.confirmLabel}
          danger={ask.danger}
          onSubmit={submitAsk}
          onClose={() => setAsk(null)}
        />
      ) : null}
    </div>
  )
}
