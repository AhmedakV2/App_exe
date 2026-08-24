import { readFile, readdir, rm } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { writeFileAtomic } from '../atomic'
import { assertScenario, parseScenario } from './validate'
import { SCENARIO_VERSION, type Scenario } from './types'

const FILE_SUFFIX = '.scenario.json'

export interface ScenarioEntry {
  id: string
  title: string
  steps: number
  updatedAt: number
  file: string
}

export class ScenarioStore {
  private readonly items = new Map<string, Scenario>()
  private readonly files = new Map<string, string>()

  constructor(private readonly directory: string) {}

  async load(): Promise<number> {
    this.items.clear()
    this.files.clear()

    let names: string[] = []
    try {
      names = await readdir(this.directory)
    } catch {
      return 0
    }

    for (const name of names) {
      if (!name.endsWith(FILE_SUFFIX)) continue
      try {
        const scenario = await this.read(join(this.directory, name))
        this.items.set(scenario.id, scenario)
        this.files.set(scenario.id, join(this.directory, name))
      } catch {
        continue
      }
    }
    return this.items.size
  }

  async read(filePath: string): Promise<Scenario> {
    const raw = JSON.parse(await readFile(filePath, 'utf8')) as unknown
    return assertScenario(parseScenario(raw))
  }

  async write(scenario: Scenario): Promise<string> {
    const checked = assertScenario(parseScenario({ ...scenario, version: SCENARIO_VERSION }))
    const filePath = this.files.get(checked.id) ?? join(this.directory, checked.id + FILE_SUFFIX)
    const payload: Scenario = { ...checked, updatedAt: Date.now() }

    await writeFileAtomic(filePath, JSON.stringify(payload, null, 2))

    this.items.set(payload.id, payload)
    this.files.set(payload.id, filePath)
    return filePath
  }

  async remove(id: string): Promise<boolean> {
    const filePath = this.files.get(id)
    if (!filePath) return false

    await rm(filePath, { force: true })
    this.items.delete(id)
    this.files.delete(id)
    return true
  }

  get(id: string): Scenario | undefined {
    return this.items.get(id)
  }

  all(): Scenario[] {
    return Array.from(this.items.values())
  }

  entries(): ScenarioEntry[] {
    return this.all()
      .map((scenario) => ({
        id: scenario.id,
        title: scenario.title,
        steps: scenario.steps.length,
        updatedAt: scenario.updatedAt,
        file: basename(this.files.get(scenario.id) ?? '')
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }
}
