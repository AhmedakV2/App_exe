import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScenarioEntry, ScenarioFolder } from '../../../main/scenario/ScenarioStore'
import type {
  Assertion,
  Scenario,
  ScenarioDefaults,
  ScenarioReport,
  ScenarioStep,
  StepKind
} from '../../../main/scenario/types'
import { Glyph, IconButton } from '../icons'
import { Card, Empty, Field, Menu, PageHead, Pill, Segmented, TextButton } from '../ui'
import type { MenuItem } from '../ui'
import ScenarioTree from '../parts/ScenarioTree'
import type { TreeTarget } from '../parts/ScenarioTree'
import StepTree from '../parts/StepTree'
import DefaultsSheet from '../parts/DefaultsSheet'
import PromptSheet from '../parts/PromptSheet'
import type { Report } from '../report'
import StepInspector from './scenario/StepInspector'
import {
  ADD_KINDS,
  KIND_TITLES,
  blankScenario,
  blankStep,
  cloneStep,
  dropStep,
  findStep,
  flatSteps,
  holdsStep,
  mapSteps,
  placeStep,
  readClip,
  shiftStep,
  typing,
  writeClip
} from './scenario/model'

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

export default function ScenarioPage({
  revision,
  createSeed,
  busy,
  baseUrl,
  onReport,
  onRun,
  onChanged
}: {
  revision: number
  createSeed: number
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
  const [addKind, setAddKind] = useState<StepKind>('click')
  const [view, setView] = useState<'steps' | 'json'>('steps')
  const [folder, setFolder] = useState('')
  const folderRef = useRef('')
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [defaultsOpen, setDefaultsOpen] = useState(false)
  const [zone, setZone] = useState<'folder' | 'scenario' | 'step'>('scenario')
  const [clip, setClip] = useState<ScenarioStep | null>(readClip())

  const jsonRef = useRef<HTMLTextAreaElement | null>(null)

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
        setZone('scenario')
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
    setZone('step')
    setDirty(true)
  }, [])

  const create = useCallback(
    (target: string): void => {
      const draftScenario = blankScenario(baseUrl)
      setSelected('')
      setDraft(draftScenario)
      setDraftPlace(target)
      setReport(null)
      setStepId(draftScenario.steps[0].id)
      setZone('scenario')
      setView('steps')
      setDirty(true)
    },
    [baseUrl]
  )

  useEffect(() => {
    folderRef.current = folder
  }, [folder])

  useEffect(() => {
    if (!createSeed) return
    create(folderRef.current)
  }, [create, createSeed])

  const addStep = useCallback((): void => {
    const created = blankStep(addKind, KIND_TITLES[addKind] ?? addKind)
    setDraft((prev) => (prev ? { ...prev, steps: prev.steps.concat(created) } : prev))
    setStepId(created.id)
    setZone('step')
    setDirty(true)
  }, [addKind])

  const selectStep = useCallback((id: string): void => {
    setStepId(id)
    setZone('step')
  }, [])

  const pickFolder = useCallback((id: string): void => {
    setFolder(id)
    setZone('folder')
  }, [])

  const copyStep = useCallback((): void => {
    if (!step) return

    setClip(writeClip(step))
    onReport({ level: 'note', text: 'Adım kopyalandı: ' + step.title })
  }, [onReport, step])

  const pasteStep = useCallback((): void => {
    if (!clip || !draft) return

    const copy = cloneStep(clip)
    setDraft((prev) => {
      if (!prev) return prev
      if (stepId && findStep(prev.steps, stepId)) {
        return { ...prev, steps: placeStep(prev.steps, stepId, copy, true) }
      }
      return { ...prev, steps: prev.steps.concat(copy) }
    })
    setStepId(copy.id)
    setZone('step')
    setDirty(true)
    onReport({ level: 'ok', text: 'Adım yapıştırıldı: ' + copy.title })
  }, [clip, draft, onReport, stepId])

  const applyJson = useCallback((): void => {
    try {
      const parsed = JSON.parse(jsonRef.current?.value ?? '') as Scenario
      setDraft(parsed)
      setStepId(parsed.steps?.[0]?.id ?? '')
      setDirty(true)
      onReport({ level: 'ok', text: 'JSON senaryoya uygulandı' })
    } catch (error) {
      onReport({ level: 'err', text: 'JSON okunamadı: ' + (error as Error).message })
    }
  }, [onReport])

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
    if (target.kind !== 'root') setZone(target.kind === 'folder' ? 'folder' : 'scenario')
    setMenu({ target, x, y })
  }, [])

  const askProject = useCallback((parentId: string): void => {
    setAsk({
      kind: 'folder-add',
      id: parentId,
      title: parentId ? 'Yeni modül' : 'Yeni proje',
      label: parentId ? 'Modül adı' : 'Proje adı',
      value: parentId ? 'Yeni modül' : 'Yeni proje',
      confirmLabel: 'Oluştur'
    })
  }, [])

  const askRemove = useCallback((id: string, title: string): void => {
    setAsk({
      kind: 'scenario-remove',
      id,
      title: 'Senaryo silinsin mi?',
      message: title + ' kalıcı olarak silinecek.',
      value: null,
      confirmLabel: 'Sil',
      danger: true
    })
  }, [])

  const askFolderRemove = useCallback(
    (id: string): void => {
      const known = folders.find((item) => item.id === id)
      if (!known) return

      setAsk({
        kind: 'folder-remove',
        id: known.id,
        title: known.kind === 'module' ? 'Modül silinsin mi?' : 'Proje silinsin mi?',
        message: known.name + ' ve içindeki tüm senaryolar kalıcı olarak silinecek.',
        value: null,
        confirmLabel: 'Sil',
        danger: true
      })
    },
    [folders]
  )

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
          askRemove(target.id, entry?.title ?? target.id)
        }
        return
      }

      if (id === 'project-add') {
        askProject('')
        return
      }

      if (id === 'module-add') {
        askProject(target.id)
        return
      }

      if (id === 'scenario-add') {
        setFolder(target.id)
        create(target.id)
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

      if (id === 'remove') askFolderRemove(known.id)
    },
    [askFolderRemove, askProject, askRemove, create, entries, folders, menu, onRun, open, selected]
  )

  const activeFolder = useMemo(
    () => folders.find((item) => item.id === folder) ?? null,
    [folder, folders]
  )

  const locked = working || busy

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (locked || menu || ask || defaultsOpen) return
      if (typing(event.target)) return

      const onSteps = Boolean(draft) && view === 'steps'

      if (event.key === 'Delete') {
        if (zone === 'step') {
          if (!onSteps || !step) return
          event.preventDefault()
          removeStep(step.id)
          return
        }
        if (zone === 'scenario') {
          if (!selected) return
          event.preventDefault()
          askRemove(selected, entries.find((item) => item.id === selected)?.title ?? selected)
          return
        }
        if (!folder) return
        event.preventDefault()
        askFolderRemove(folder)
        return
      }

      if (!event.ctrlKey && !event.metaKey) return
      if (event.altKey || event.shiftKey || !onSteps) return

      const key = event.key.toLowerCase()
      if (key === 'c' && step) {
        event.preventDefault()
        copyStep()
        return
      }
      if (key === 'v' && clip) {
        event.preventDefault()
        pasteStep()
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    ask,
    askFolderRemove,
    askRemove,
    clip,
    copyStep,
    defaultsOpen,
    draft,
    entries,
    folder,
    locked,
    menu,
    pasteStep,
    removeStep,
    selected,
    step,
    view,
    zone
  ])

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
              {dirty ? <Pill tone="accent">Kaydedilmedi</Pill> : null}
              <Pill>{steps.length} adım</Pill>
            </>
          ) : null
        }
        actions={
          <>
            <TextButton
              glyph="plus"
              label="Yeni"
              onClick={() => create(folder)}
              disabled={locked}
            />
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
              onClick={() => askRemove(selected, draft?.title ?? selected)}
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
                onClick={() => askProject('')}
                disabled={locked}
                small
              />
              <IconButton
                name="module"
                title="Yeni modül"
                onClick={() => askProject(folder)}
                disabled={locked || activeFolder?.kind !== 'project'}
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
            onPickFolder={pickFolder}
            onMove={(id, target) => void moveScenario(id, target)}
            onMenu={openMenu}
          />
        </Card>

        <Card
          label={view === 'json' ? 'Senaryo JSON' : 'Adımlar'}
          scroll
          grow
          lead={
            draft ? (
              <span className="head-group">
                {view === 'steps' ? (
                  <>
                    <select
                      className="picker slim"
                      value={addKind}
                      onChange={(event) => setAddKind(event.target.value as StepKind)}
                      disabled={locked}
                      aria-label="Adım türü"
                    >
                      {ADD_KINDS.map((kind) => (
                        <option key={kind} value={kind}>
                          {KIND_TITLES[kind] ?? kind}
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
                  </>
                ) : (
                  <TextButton
                    glyph="check"
                    label="Uygula"
                    onClick={applyJson}
                    disabled={locked}
                    tone="primary"
                  />
                )}
              </span>
            ) : null
          }
          actions={
            draft ? (
              <Segmented
                items={[
                  { id: 'steps', label: 'Adımlar' },
                  { id: 'json', label: 'JSON' }
                ]}
                value={view}
                onPick={(id) => setView(id as 'steps' | 'json')}
                disabled={locked}
              />
            ) : null
          }
        >
          {draft ? (
            view === 'json' ? (
              <textarea
                key={'sc:' + draft.id + ':' + draft.updatedAt + ':' + steps.length}
                ref={jsonRef}
                className="code-area"
                defaultValue={JSON.stringify(draft, null, 2)}
                spellCheck={false}
                aria-label="Senaryo JSON"
              />
            ) : (
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

                <StepTree
                  steps={steps}
                  selected={stepId}
                  disabled={locked}
                  onSelect={selectStep}
                  onMove={dragStep}
                />

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
            )
          ) : (
            <Empty
              glyph="file"
              text="Senaryo seçilmedi"
              hint="Soldaki kütüphaneden bir senaryo açın ya da yeni bir senaryo oluşturun."
            />
          )}
        </Card>

        <StepInspector
          draft={draft}
          step={step}
          locked={locked}
          clip={clip}
          place={place}
          onOpenDefaults={() => setDefaultsOpen(true)}
          onMove={moveStep}
          onCopy={copyStep}
          onPaste={pasteStep}
          onRemove={removeStep}
          onPatch={patchStep}
          onPatchAssertion={patchAssertion}
        />
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
