import { mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

let counter = 0

function tempName(filePath: string): string {
  counter += 1
  const parts = [basename(filePath), process.pid, Date.now(), counter, 'tmp']
  return join(dirname(filePath), '.' + parts.join('.'))
}
export async function writeFileAtomic(filePath: string, data: string | Uint8Array): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const temp = tempName(filePath)
  try {
    await writeFile(temp, data)
    await rename(temp, filePath)
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined)
    throw error
  }
}
export async function quarantine(filePath: string): Promise<string> {
  const target = filePath + '.corrupt-' + Date.now()
  await rename(filePath, target)
  return target
}
