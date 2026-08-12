const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

export function hash32(value: string): number {
  let hash = FNV_OFFSET
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, FNV_PRIME)
  }
  return hash >>> 0
}

export function token(value: string): string {
  return hash32(value).toString(36).padStart(7, '0')
}

export function digest(parts: (string | number | boolean | null | undefined)[]): string {
  return token(
    parts.map((part) => (part === null || part === undefined ? '' : part)).join('\u0001')
  )
}
