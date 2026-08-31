const DEFAULT_BUDGET_MS = 8

export function yieldToLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

export async function chunk(
  total: number,
  step: (index: number) => void,
  budgetMs: number = DEFAULT_BUDGET_MS
): Promise<void> {
  let started = Date.now()
  for (let i = 0; i < total; i++) {
    step(i)
    if ((i & 255) !== 255) continue
    if (Date.now() - started < budgetMs) continue
    await yieldToLoop()
    started = Date.now()
  }
}

export async function chunkOver<T>(
  items: readonly T[],
  step: (item: T, index: number) => void,
  budgetMs: number = DEFAULT_BUDGET_MS
): Promise<void> {
  await chunk(items.length, (index) => step(items[index], index), budgetMs)
}
