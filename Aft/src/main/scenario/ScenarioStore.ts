import { mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { basename, join, relative, sep } from 'node:path'
import { writeFileAtomic } from '../atomic'
import { assertScenario, parseScenario } from './validate'
import { SCENARIO_VERSION, type Scenario } from './types'

const FILE_SUFFIX = '.scenario.json'

const FOLDER_DEPTH = 2

const NAME_LIMIT = 64

const RESERVED = '<>:"/\\|?*'

export type ScenarioFolderKind = 'project' | 'module'

export interface ScenarioFolder {
  id: string
  name: string
  kind: ScenarioFolderKind
  parentId: string
  scenarios: number
}

export interface ScenarioEntry {
  id: string
  title: string
  steps: number
  updatedAt: number
  file: string
  folder: string
}

export function folderName(raw: string): string {
  let out = ''
  for (const letter of String(raw)) {
    const code = letter.codePointAt(0) ?? 0
    out += code < 32 || code === 127 || RESERVED.includes(letter) ? ' ' : letter
  }

  const clean = out
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+/, '')
    .replace(/[.\s]+$/, '')
  if (!clean) throw new Error('Klasor adi gecersiz')
  return clean.slice(0, NAME_LIMIT)
}

function folderKind(id: string): ScenarioFolderKind {
  return id.split('/').length > 1 ? 'module' : 'project'
}

function parentOf(id: string): string {
  const index = id.lastIndexOf('/')
  return index < 0 ? '' : id.slice(0, index)
}

export class ScenarioStore {
  private readonly items = new Map<string, Scenario>()
  private readonly files = new Map<string, string>()
  private readonly places = new Map<string, string>()
  private readonly dirs = new Map<string, ScenarioFolder>()

  constructor(private readonly directory: string) {}

  async load(): Promise<number> {
    this.items.clear()
    this.files.clear()
    this.places.clear()
    this.dirs.clear()

    await this.walk(this.directory, '', 0)
    return this.items.size
  }

  async read(filePath: string): Promise<Scenario> {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    return assertScenario(parseScenario(raw))
  }

  async write(scenario: Scenario, folder: string | null = null): Promise<string> {
    const checked = assertScenario(parseScenario({ ...scenario, version: SCENARIO_VERSION }))
    const current = this.places.get(checked.id) ?? ''
    const place = folder === null ? current : this.resolveFolder(folder)
    const known = this.files.get(checked.id)
    const target =
      known && place === current
        ? known
        : join(this.pathOf(place), known ? basename(known) : checked.id + FILE_SUFFIX)
    const payload: Scenario = { ...checked, updatedAt: Date.now() }

    await writeFileAtomic(target, JSON.stringify(payload, null, 2))
    if (known && known !== target) await rm(known, { force: true })

    this.items.set(payload.id, payload)
    this.files.set(payload.id, target)
    this.places.set(payload.id, place)
    return target
  }

  async remove(id: string): Promise<boolean> {
    const filePath = this.files.get(id)
    if (!filePath) return false

    await rm(filePath, { force: true })
    this.items.delete(id)
    this.files.delete(id)
    this.places.delete(id)
    return true
  }

  async move(id: string, folder: string): Promise<string> {
    const filePath = this.files.get(id)
    if (!filePath) throw new Error('Senaryo bulunamadi: ' + id)

    const place = this.resolveFolder(folder)
    if (place && !this.dirs.has(place)) throw new Error('Klasor bulunamadi: ' + place)
    if ((this.places.get(id) ?? '') === place) return filePath

    const directory = this.pathOf(place)
    const target = join(directory, basename(filePath))

    await mkdir(directory, { recursive: true })
    await rename(filePath, target)

    this.files.set(id, target)
    this.places.set(id, place)
    return target
  }

  async createFolder(parentId: string, name: string): Promise<ScenarioFolder> {
    const parent = this.resolveFolder(parentId)
    if (parent && !this.dirs.has(parent)) throw new Error('Klasor bulunamadi: ' + parent)
    if (parent && folderKind(parent) === 'module') throw new Error('Modul icinde klasor acilamaz')

    const clean = folderName(name)
    const id = parent ? parent + '/' + clean : clean
    if (this.dirs.has(id)) throw new Error('Bu isimde klasor zaten var: ' + clean)

    await mkdir(this.pathOf(id), { recursive: true })

    const created: ScenarioFolder = {
      id,
      name: clean,
      kind: folderKind(id),
      parentId: parent,
      scenarios: 0
    }
    this.dirs.set(id, created)
    return created
  }

  async renameFolder(id: string, name: string): Promise<ScenarioFolder> {
    const current = this.resolveFolder(id)
    if (!current) throw new Error('Kok klasor yeniden adlandirilamaz')
    if (!this.dirs.has(current)) throw new Error('Klasor bulunamadi: ' + current)

    const clean = folderName(name)
    const parent = parentOf(current)
    const next = parent ? parent + '/' + clean : clean
    if (next === current) return this.dirs.get(current) as ScenarioFolder
    if (this.dirs.has(next)) throw new Error('Bu isimde klasor zaten var: ' + clean)

    await rename(this.pathOf(current), this.pathOf(next))
    await this.load()

    const moved = this.dirs.get(next)
    if (!moved) throw new Error('Klasor yeniden adlandirilamadi: ' + clean)
    return moved
  }

  async removeFolder(id: string): Promise<boolean> {
    const current = this.resolveFolder(id)
    if (!current) throw new Error('Kok klasor silinemez')
    if (!this.dirs.has(current)) return false

    await rm(this.pathOf(current), { recursive: true, force: true })
    await this.load()
    return true
  }

  get(id: string): Scenario | undefined {
    return this.items.get(id)
  }

  all(): Scenario[] {
    return Array.from(this.items.values())
  }

  folderOf(id: string): string {
    return this.places.get(id) ?? ''
  }

  folders(): ScenarioFolder[] {
    const counts = new Map<string, number>()
    for (const place of this.places.values()) counts.set(place, (counts.get(place) ?? 0) + 1)

    return Array.from(this.dirs.values())
      .map((folder) => ({ ...folder, scenarios: counts.get(folder.id) ?? 0 }))
      .sort((a, b) => a.id.localeCompare(b.id, 'tr'))
  }

  entries(): ScenarioEntry[] {
    return this.all()
      .map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        steps: scenario.steps.length,
        updatedAt: scenario.updatedAt,
        file: basename(this.files.get(scenario.id) ?? ''),
        folder: this.places.get(scenario.id) ?? ''
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  private async walk(directory: string, folder: string, depth: number): Promise<void> {
    let names: { name: string; directory: boolean }[] = []
    try {
      names = (await readdir(directory, { withFileTypes: true })).map((item) => ({
        name: item.name,
        directory: item.isDirectory()
      }))
    } catch {
      return
    }

    for (const item of names) {
      const full = join(directory, item.name)

      if (!item.directory) {
        if (!item.name.endsWith(FILE_SUFFIX)) continue
        try {
          const scenario = await this.read(full)
          this.items.set(scenario.id, scenario)
          this.files.set(scenario.id, full)
          this.places.set(scenario.id, folder)
        } catch {
          continue
        }
        continue
      }

      if (depth >= FOLDER_DEPTH || item.name.startsWith('.')) continue

      const id = folder ? folder + '/' + item.name : item.name
      this.dirs.set(id, {
        id,
        name: item.name,
        kind: folderKind(id),
        parentId: folder,
        scenarios: 0
      })
      await this.walk(full, id, depth + 1)
    }
  }

  private resolveFolder(id: string): string {
    const clean = String(id ?? '')
      .replace(/\\/g, '/')
      .replace(/^\/+|\/+$/g, '')
    if (!clean) return ''

    const parts = clean.split('/').filter((part) => part && part !== '.' && part !== '..')
    if (!parts.length) return ''
    if (parts.length > FOLDER_DEPTH) throw new Error('Klasor derinligi asildi: ' + clean)

    const resolved = parts.join('/')
    const inside = relative(this.directory, this.pathOf(resolved))
    if (inside.startsWith('..') || inside.includes('..' + sep)) {
      throw new Error('Klasor yolu gecersiz: ' + clean)
    }
    return resolved
  }

  private pathOf(folder: string): string {
    return folder ? join(this.directory, ...folder.split('/')) : this.directory
  }
}
