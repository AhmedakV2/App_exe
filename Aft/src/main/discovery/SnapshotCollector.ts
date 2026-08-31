import { chunk } from './scheduler'
import type { Transport } from './Transport'
import { STYLE_KEYS, type Rect } from './types'

export interface DocNode {
  index: number
  parentIndex: number
  backendNodeId: number
  nodeType: number
  nodeName: string
  nodeValue: string
  attrs: Record<string, string>
  shadowRootType: string
  contentDocumentIndex: number
  isClickable: boolean
  inputValue: string
  textValue: string
  inputChecked: boolean
  pseudoType: string
  layoutIndex: number
}

export interface DocSnap {
  index: number
  frameId: string
  documentURL: string
  title: string
  scrollX: number
  scrollY: number
  contentWidth: number
  contentHeight: number
  nodes: DocNode[]
  bounds: (Rect | null)[]
  clientRects: (Rect | null)[]
  scrollRects: (Rect | null)[]
  styles: (Record<string, string> | null)[]
  paintOrders: number[]
}

export interface SessionSnap {
  sessionId: string
  docs: DocSnap[]
}

interface RareString {
  index: number[]
  value: number[]
}

interface RareInt {
  index: number[]
  value: number[]
}

interface RareBool {
  index: number[]
}

interface RawNodes {
  parentIndex: number[]
  nodeType: number[]
  nodeName: number[]
  nodeValue: number[]
  backendNodeId: number[]
  attributes: number[][]
  shadowRootType?: RareString
  contentDocumentIndex?: RareInt
  isClickable?: RareBool
  inputValue?: RareString
  textValue?: RareString
  inputChecked?: RareBool
  pseudoType?: RareString
}

interface RawLayout {
  nodeIndex: number[]
  styles: number[][]
  bounds: number[][]
  paintOrders?: number[]
  clientRects?: number[][]
  scrollRects?: number[][]
}

interface RawDoc {
  documentURL: number
  title: number
  frameId: number
  scrollOffsetX: number
  scrollOffsetY: number
  contentWidth: number
  contentHeight: number
  nodes: RawNodes
  layout: RawLayout
}

interface RawSnapshot {
  documents: RawDoc[]
  strings: string[]
}

export async function captureSession(
  tp: Transport,
  sessionId: string
): Promise<SessionSnap | null> {
  const raw = await tp.trySend<RawSnapshot>(
    'DOMSnapshot.captureSnapshot',
    { computedStyles: STYLE_KEYS, includePaintOrder: true, includeDOMRects: true },
    sessionId
  )
  if (!raw || !Array.isArray(raw.documents)) return null

  const docs: DocSnap[] = []
  for (let i = 0; i < raw.documents.length; i++) {
    docs.push(await decodeDoc(raw.documents[i], i, raw.strings))
  }
  return { sessionId, docs }
}

async function decodeDoc(doc: RawDoc, docIndex: number, strings: string[]): Promise<DocSnap> {
  const shadow = stringMap(doc.nodes.shadowRootType, strings)
  const inputValue = stringMap(doc.nodes.inputValue, strings)
  const textValue = stringMap(doc.nodes.textValue, strings)
  const pseudo = stringMap(doc.nodes.pseudoType, strings)
  const content = intMap(doc.nodes.contentDocumentIndex)
  const clickable = boolSet(doc.nodes.isClickable)
  const checked = boolSet(doc.nodes.inputChecked)

  const total = doc.nodes.nodeType.length
  const nodes: DocNode[] = new Array(total)
  await chunk(total, (i) => {
    nodes[i] = {
      index: i,
      parentIndex: doc.nodes.parentIndex[i] ?? -1,
      backendNodeId: doc.nodes.backendNodeId[i] ?? -1,
      nodeType: doc.nodes.nodeType[i] ?? 1,
      nodeName: (strings[doc.nodes.nodeName[i]] ?? '').toLowerCase(),
      nodeValue: strings[doc.nodes.nodeValue[i]] ?? '',
      attrs: decodeAttrs(doc.nodes.attributes?.[i], strings),
      shadowRootType: shadow.get(i) ?? '',
      contentDocumentIndex: content.get(i) ?? -1,
      isClickable: clickable.has(i),
      inputValue: inputValue.get(i) ?? '',
      textValue: textValue.get(i) ?? '',
      inputChecked: checked.has(i),
      pseudoType: pseudo.get(i) ?? '',
      layoutIndex: -1
    }
  })
  const bounds: (Rect | null)[] = new Array(total).fill(null)
  const clientRects: (Rect | null)[] = new Array(total).fill(null)
  const scrollRects: (Rect | null)[] = new Array(total).fill(null)
  const styles: (Record<string, string> | null)[] = new Array(total).fill(null)
  const paintOrders: number[] = new Array(total).fill(0)

  const layout = doc.layout
  await chunk(layout.nodeIndex.length, (k) => {
    const at = layout.nodeIndex[k]
    if (at === undefined || at < 0 || at >= total) return
    nodes[at].layoutIndex = k
    bounds[at] = toRect(layout.bounds?.[k])
    clientRects[at] = toRect(layout.clientRects?.[k])
    scrollRects[at] = toRect(layout.scrollRects?.[k])
    styles[at] = decodeStyle(layout.styles?.[k], strings)
    paintOrders[at] = layout.paintOrders?.[k] ?? 0
  })

  return {
    index: docIndex,
    frameId: strings[doc.frameId] ?? '',
    documentURL: strings[doc.documentURL] ?? '',
    title: strings[doc.title] ?? '',
    scrollX: doc.scrollOffsetX ?? 0,
    scrollY: doc.scrollOffsetY ?? 0,
    contentWidth: doc.contentWidth ?? 0,
    contentHeight: doc.contentHeight ?? 0,
    nodes,
    bounds,
    clientRects,
    scrollRects,
    styles,
    paintOrders
  }
}

function decodeAttrs(flat: number[] | undefined, strings: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!flat) return out
  for (let i = 0; i < flat.length; i += 2) {
    const name = strings[flat[i]]
    if (!name) continue
    out[name.toLowerCase()] = strings[flat[i + 1]] ?? ''
  }
  return out
}

function decodeStyle(indexes: number[] | undefined, strings: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  if (!indexes) return out
  for (let i = 0; i < STYLE_KEYS.length; i++) {
    out[STYLE_KEYS[i]] = strings[indexes[i]] ?? ''
  }
  return out
}

function toRect(raw: number[] | undefined): Rect | null {
  if (!raw || raw.length < 4) return null
  return { x: raw[0], y: raw[1], w: raw[2], h: raw[3] }
}

function stringMap(data: RareString | undefined, strings: string[]): Map<number, string> {
  const out = new Map<number, string>()
  if (!data) return out
  for (let i = 0; i < data.index.length; i++) {
    out.set(data.index[i], strings[data.value[i]] ?? '')
  }
  return out
}

function intMap(data: RareInt | undefined): Map<number, number> {
  const out = new Map<number, number>()
  if (!data) return out
  for (let i = 0; i < data.index.length; i++) out.set(data.index[i], data.value[i])
  return out
}

function boolSet(data: RareBool | undefined): Set<number> {
  const out = new Set<number>()
  if (!data) return out
  for (const i of data.index) out.add(i)
  return out
}
