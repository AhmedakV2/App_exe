import type { Transport } from './Transport'
import type { AxInfo } from './types'

interface AxValue {
  type?: string
  value?: unknown
}

interface AxProperty {
  name: string
  value?: AxValue
}

interface AxNode {
  ignored?: boolean
  role?: AxValue
  name?: AxValue
  description?: AxValue
  properties?: AxProperty[]
  backendDOMNodeId?: number
}

export type AxMap = Map<string, AxInfo>

export async function collectAx(tp: Transport, sessionIds: string[]): Promise<AxMap> {
  const out: AxMap = new Map()
  const trees = await Promise.all(sessionIds.map((sessionId) => collectOne(tp, sessionId)))

  for (const tree of trees) {
    if (!tree) continue
    for (const node of tree.nodes) {
      if (typeof node.backendDOMNodeId !== 'number') continue
      out.set(tree.sessionId + ':' + node.backendDOMNodeId, toInfo(node))
    }
  }
  return out
}

async function collectOne(
  tp: Transport,
  sessionId: string
): Promise<{ sessionId: string; nodes: AxNode[] } | null> {
  await tp.trySend('Accessibility.enable', {}, sessionId)
  const res = await tp.trySend<{ nodes: AxNode[] }>('Accessibility.getFullAXTree', {}, sessionId)
  return res?.nodes ? { sessionId, nodes: res.nodes } : null
}

function toInfo(node: AxNode): AxInfo {
  const props = new Map<string, unknown>()
  for (const property of node.properties ?? []) props.set(property.name, property.value?.value)
  return {
    role: text(node.role),
    name: text(node.name),
    description: text(node.description),
    focusable: props.get('focusable') === true,
    disabled: props.get('disabled') === true,
    hidden: props.get('hidden') === true || node.ignored === true,
    checked: str(props.get('checked')),
    expanded: str(props.get('expanded')),
    selected: str(props.get('selected'))
  }
}

function text(value: AxValue | undefined): string {
  const raw = value?.value
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
}

function str(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}
