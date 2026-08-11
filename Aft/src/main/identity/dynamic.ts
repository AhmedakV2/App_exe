const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const HEX_BLOB = /^[0-9a-f]{8,}$/i

const LONG_DIGITS = /\d{5,}/

const FRAMEWORK_PREFIX =
  /^(ember\d|react-aria-|radix-|mui-|mat-|ng-|cdk-|v-|_ngcontent|_nghost|headlessui-|reach-|chakra-|aria-\d)/i

const CSS_MODULE = /^[A-Za-z][\w-]*?(?:__|--|_)[A-Za-z0-9]*[a-z0-9]{5,}$/

const STYLED = /^(sc-|css-|jsx-|emotion-|styled-)[A-Za-z0-9]{4,}$/i

const HASH_SUFFIX = /[-_][A-Za-z0-9]{5,}$/

const TAILWIND_ARBITRARY = /\[[^\]]+\]/

const VOLATILE_ATTRS: ReadonlySet<string> = new Set([
  'style',
  'class',
  'srcset',
  'nonce',
  'data-reactid',
  'data-react-checksum',
  'data-v-app'
])

export function isVolatileAttribute(name: string): boolean {
  return VOLATILE_ATTRS.has(name.toLowerCase())
}

export function isDynamicValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (UUID.test(trimmed)) return true
  if (HEX_BLOB.test(trimmed)) return true
  if (LONG_DIGITS.test(trimmed)) return true
  if (FRAMEWORK_PREFIX.test(trimmed)) return true
  if (STYLED.test(trimmed)) return true
  if (CSS_MODULE.test(trimmed)) return true
  if (TAILWIND_ARBITRARY.test(trimmed)) return true
  if (trimmed.length > 48) return true
  return entropy(trimmed) > 3.6 && trimmed.length >= 10
}

export function isStableIdentifier(value: string): boolean {
  return !isDynamicValue(value)
}

export function stableClasses(className: string): string[] {
  return className
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 2 && entry.length <= 32)
    .filter((entry) => !isDynamicValue(entry))
    .filter((entry) => !HASH_SUFFIX.test(entry) || entry.split(/[-_]/).length <= 2)
    .slice(0, 4)
    .sort()
}

export function entropy(value: string): number {
  const counts = new Map<string, number>()
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1)

  let total = 0
  for (const count of counts.values()) {
    const ratio = count / value.length
    total -= ratio * Math.log2(ratio)
  }
  return total
}

export function normalizeText(value: string, cap = 80): string {
  const trimmed = value.replace(/\s+/g, ' ').trim().toLowerCase()
  return trimmed.length > cap ? trimmed.slice(0, cap) : trimmed
}

export function isMeaningfulText(value: string): boolean {
  const normalized = normalizeText(value)
  if (normalized.length < 2 || normalized.length > 80) return false
  if (LONG_DIGITS.test(normalized)) return false
  return /[a-z\u00c0-\u024f]/.test(normalized)
}
