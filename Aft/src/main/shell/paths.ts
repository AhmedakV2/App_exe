import { existsSync } from 'node:fs'
import { join } from 'node:path'

export function preloadPath(mainDir: string): string {
  const mjs = join(mainDir, '../preload/index.mjs')
  return existsSync(mjs) ? mjs : join(mainDir, '../preload/index.js')
}
