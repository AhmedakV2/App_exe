import { app } from 'electron'

interface Check {
  name: string
  ok: boolean
  detail: string
}

const checks: Check[] = []

export function expect(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok, detail })
  process.stdout.write((ok ? 'GECTI ' : 'KALDI ') + name + ' | ' + detail + '\n')
}

export function step(name: string): void {
  process.stdout.write('... ' + name + '\n')
}

export function verdict(): number {
  const failed = checks.filter((check) => !check.ok).length
  process.stdout.write('\nToplam ' + checks.length + ', basarisiz ' + failed + '\n')
  return failed === 0 ? 0 : 1
}

export function runEntry(main: () => Promise<number>, announce = false): void {
  app.whenReady().then(() => {
    if (announce) step('electron hazir')
    main().then(
      (code) => app.exit(code),
      (error: unknown) => {
        process.stderr.write((error instanceof Error ? error.stack : String(error)) + '\n')
        app.exit(3)
      }
    )
  })

  app.on('window-all-closed', () => undefined)
}
