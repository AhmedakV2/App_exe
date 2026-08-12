import { digest } from '../model'
import type { ModelIndex } from '../model'
import type { ElementModel } from '../model'
import { isDynamicValue, normalizeText, stableClasses } from './dynamic'

const PATH_DEPTH = 6

const ANCESTOR_DEPTH = 4

const NEIGHBOUR_RADIUS = 220

const NEIGHBOUR_COUNT = 4

type SignatureCache = Map<string, string>

const structuralCache = new WeakMap<ModelIndex, SignatureCache>()

const ancestorCache = new WeakMap<ModelIndex, SignatureCache>()

const neighborCache = new WeakMap<ModelIndex, SignatureCache>()

const formCache = new WeakMap<ModelIndex, SignatureCache>()

export function structuralPath(
  element: ElementModel,
  index: ModelIndex,
  depth = PATH_DEPTH
): string {
  return memoize(structuralCache, index, element.identity.ref + ':' + depth, () => {
    const parts: string[] = []
    let cursor: ElementModel | undefined = element

    while (cursor && parts.length < depth) {
      parts.unshift(segment(cursor, index))
      const parent: ElementModel | undefined = index.parent(cursor)
      if (!parent || parent.nodeType !== 1) break
      cursor = parent
    }
    return parts.join('>')
  })
}

export function ancestorSignature(
  element: ElementModel,
  index: ModelIndex,
  depth = ANCESTOR_DEPTH
): string {
  return memoize(ancestorCache, index, element.identity.ref + ':' + depth, () => {
    const parts = index
      .ancestors(element, depth)
      .filter((node) => node.nodeType === 1)
      .map((node) => {
        const role = node.attrs['role'] || node.accessibility?.role || ''
        const anchor = stableAnchor(node)
        return node.tag + (role ? ':' + role : '') + (anchor ? '#' + anchor : '')
      })
    return digest(parts)
  })
}

export function neighborSignature(element: ElementModel, index: ModelIndex): string {
  return memoize(neighborCache, index, element.identity.ref, () => {
    const labels = index
      .near(element, NEIGHBOUR_RADIUS, NEIGHBOUR_COUNT * 3)
      .map((node) => normalizeText(labelOf(node), 32))
      .filter((label) => label.length >= 2)
      .slice(0, NEIGHBOUR_COUNT)
      .sort()
    return digest(labels)
  })
}

export function nearestLabel(element: ElementModel, index: ModelIndex): string {
  const explicit = element.attrs['aria-label'] || element.accessibility?.name || ''
  if (explicit) return normalizeText(explicit, 48)

  const labelledBy = element.attrs['aria-labelledby']
  if (labelledBy) {
    const target = index.byAttr('id', labelledBy.split(/\s+/)[0] ?? '')[0]
    if (target) return normalizeText(target.text, 48)
  }
  const id = element.attrs['id']
  if (id) {
    const bound = index.byAttr('for', id).find((node) => node.tag === 'label')
    if (bound) return normalizeText(bound.text, 48)
  }
  const wrapper = index.ancestors(element, ANCESTOR_DEPTH).find((node) => node.tag === 'label')
  if (wrapper) return normalizeText(wrapper.text, 48)

  for (const neighbour of index.near(element, NEIGHBOUR_RADIUS, NEIGHBOUR_COUNT)) {
    const text = normalizeText(neighbour.text, 48)
    if (text.length >= 2) return text
  }
  return ''
}

export function formSignature(element: ElementModel, index: ModelIndex): string {
  return memoize(formCache, index, element.identity.ref, () => {
    const form = index.closestForm(element)
    if (!form) return ''

    const anchor =
      stableAnchor(form) ||
      normalizeText(form.attrs['name'] ?? '', 32) ||
      normalizeText(pathOf(form.attrs['action'] ?? ''), 48)
    return digest([anchor, form.attrs['method'] ?? '', index.children(form).length])
  })
}

function memoize(
  store: WeakMap<ModelIndex, SignatureCache>,
  index: ModelIndex,
  key: string,
  compute: () => string
): string {
  let cache = store.get(index)
  if (!cache) {
    cache = new Map<string, string>()
    store.set(index, cache)
  }
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const value = compute()
  cache.set(key, value)
  return value
}

export function urlPattern(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return url
  }
  const segments = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => (isDynamicValue(segment) ? '*' : segment.toLowerCase()))
  return parsed.origin.toLowerCase() + '/' + segments.join('/')
}

export function stableAnchor(element: ElementModel): string {
  const id = element.attrs['id']
  if (id && !isDynamicValue(id)) return id
  const classes = stableClasses(element.attrs['class'] ?? '')
  return classes.length ? classes[0] : ''
}

export function labelOf(element: ElementModel): string {
  return (
    element.accessibility?.name ||
    element.attrs['aria-label'] ||
    element.attrs['placeholder'] ||
    element.attrs['title'] ||
    element.attrs['alt'] ||
    element.text ||
    ''
  )
}

function segment(element: ElementModel, index: ModelIndex): string {
  const anchor = stableAnchor(element)
  if (anchor) return element.tag + '.' + anchor
  return element.tag + ':' + index.typeOrdinal(element)
}

function pathOf(action: string): string {
  try {
    return new URL(action, 'https://placeholder.invalid').pathname
  } catch {
    return action
  }
}
