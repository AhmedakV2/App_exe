import type { Transport } from './Transport'

const WORLD = 'aft_probe'

const PROBE_VERSION = 3

const WATCHED_ATTRIBUTES = [
  'disabled',
  'aria-disabled',
  'aria-expanded',
  'aria-checked',
  'aria-selected',
  'aria-hidden',
  'checked',
  'selected',
  'readonly',
  'hidden',
  'open',
  'value',
  'href',
  'src',
  'role',
  'type'
]

const PROBE_SOURCE = `(function(){
if (window.__aftProbe && window.__aftProbe.v === ${PROBE_VERSION}) return;
var s = { v: ${PROBE_VERSION}, m: 0, t: Date.now() };
window.__aftProbe = s;
var bump = function(){ s.m = s.m + 1; s.t = Date.now(); };
var relevant = function(records){
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    if (r.type === 'attributes') { bump(); return; }
    if (r.type !== 'childList') continue;
    if (r.addedNodes.length === 0 && r.removedNodes.length === 0) continue;
    bump();
    return;
  }
};
var opts = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ${JSON.stringify(WATCHED_ATTRIBUTES)}
};
try { new MutationObserver(relevant).observe(document, opts); } catch (e) { s.m = s.m; }
addEventListener('scroll', bump, true);
addEventListener('load', bump, true);
addEventListener('input', bump, true);
addEventListener('change', bump, true);
})()`

const READ_SOURCE = `JSON.stringify((function(){
var s = window.__aftProbe;
var d = document.documentElement;
return {
ok: !!s,
m: s ? s.m : -1,
idle: s ? Date.now() - s.t : 0,
url: location.href,
title: document.title,
sx: Math.round(window.scrollX),
sy: Math.round(window.scrollY),
w: Math.round(window.innerWidth),
h: Math.round(window.innerHeight),
pw: d ? d.scrollWidth : 0,
ph: d ? d.scrollHeight : 0,
dpr: window.devicePixelRatio || 1
};
})())`

export interface ProbeReading {
  ok: boolean
  m: number
  idle: number
  url: string
  title: string
  sx: number
  sy: number
  w: number
  h: number
  pw: number
  ph: number
  dpr: number
}

export interface QuietResult {
  reading: ProbeReading
  timedOut: boolean
  waitedMs: number
}

const EMPTY: ProbeReading = {
  ok: false,
  m: -1,
  idle: 0,
  url: '',
  title: '',
  sx: 0,
  sy: 0,
  w: 0,
  h: 0,
  pw: 0,
  ph: 0,
  dpr: 1
}

interface EvalResult {
  result?: { value?: unknown }
  exceptionDetails?: unknown
}

const RESTLESS_LIMIT = 2

const RESTLESS_QUIET_MS = 60

const RESTLESS_TIMEOUT_MS = 300

export class StabilityWaiter {
  private readonly contexts = new Map<string, number>()
  private readonly installed = new Set<string>()
  private readonly restless = new Map<string, number>()

  constructor(private readonly tp: Transport) {
    tp.on('Runtime.executionContextCreated', (params, sessionId) => {
      const ctx = params.context as
        { id: number; name: string; auxData?: { frameId?: string } } | undefined
      if (!ctx || ctx.name !== WORLD) return
      this.contexts.set(this.ck(sessionId, ctx.auxData?.frameId ?? ''), ctx.id)
    })
    tp.on('Runtime.executionContextDestroyed', (params, sessionId) => {
      const id = Number(params.executionContextId ?? -1)
      for (const [key, value] of Array.from(this.contexts)) {
        if (value === id && key.startsWith(sessionId + '|')) this.contexts.delete(key)
      }
    })
    tp.on('Runtime.executionContextsCleared', (_params, sessionId) => {
      for (const key of Array.from(this.contexts.keys())) {
        if (key.startsWith(sessionId + '|')) this.contexts.delete(key)
      }
    })
    tp.on('Page.frameNavigated', (params, sessionId) => {
      const frame = params.frame as { id?: string } | undefined
      if (frame?.id) this.contexts.delete(this.ck(sessionId, frame.id))
    })
  }

  async install(sessionId: string): Promise<void> {
    if (this.installed.has(sessionId)) return
    this.installed.add(sessionId)
    const withFlag = await this.tp.trySend(
      'Page.addScriptToEvaluateOnNewDocument',
      { source: PROBE_SOURCE, worldName: WORLD, runImmediately: true },
      sessionId
    )
    if (withFlag === null) {
      await this.tp.trySend(
        'Page.addScriptToEvaluateOnNewDocument',
        { source: PROBE_SOURCE, worldName: WORLD },
        sessionId
      )
    }
  }

  async read(sessionId: string, frameId: string): Promise<ProbeReading> {
    const contextId = await this.context(sessionId, frameId)
    if (contextId === null) return EMPTY
    const res = await this.tp.trySend<EvalResult>(
      'Runtime.evaluate',
      { expression: READ_SOURCE, contextId, returnByValue: true },
      sessionId
    )
    const raw = res?.result?.value
    if (typeof raw !== 'string') return EMPTY
    try {
      return JSON.parse(raw) as ProbeReading
    } catch {
      return EMPTY
    }
  }

  async waitForQuiet(
    sessionId: string,
    frameId: string,
    quietMs: number,
    timeoutMs: number
  ): Promise<QuietResult> {
    const scope = this.ck(sessionId, frameId)
    const restless = this.restless.get(scope) ?? 0
    const wantedQuiet = restless >= RESTLESS_LIMIT ? Math.min(quietMs, RESTLESS_QUIET_MS) : quietMs
    const budget = restless >= RESTLESS_LIMIT ? Math.min(timeoutMs, RESTLESS_TIMEOUT_MS) : timeoutMs

    const started = Date.now()
    let reading = await this.read(sessionId, frameId)
    while (Date.now() - started < budget) {
      if (reading.ok && reading.idle >= wantedQuiet) {
        this.restless.delete(scope)
        return { reading, timedOut: false, waitedMs: Date.now() - started }
      }
      await delay(40)
      reading = await this.read(sessionId, frameId)
    }

    this.restless.set(scope, restless + 1)
    return { reading, timedOut: true, waitedMs: Date.now() - started }
  }

  async scrollBy(sessionId: string, frameId: string, dy: number): Promise<void> {
    const contextId = await this.context(sessionId, frameId)
    if (contextId === null) return
    await this.tp.trySend(
      'Runtime.evaluate',
      { expression: 'window.scrollBy(0,' + Math.round(dy) + ')', contextId },
      sessionId
    )
  }

  async scrollTo(sessionId: string, frameId: string, x: number, y: number): Promise<void> {
    const contextId = await this.context(sessionId, frameId)
    if (contextId === null) return
    await this.tp.trySend(
      'Runtime.evaluate',
      { expression: 'window.scrollTo(' + Math.round(x) + ',' + Math.round(y) + ')', contextId },
      sessionId
    )
  }

  private ck(sessionId: string, frameId: string): string {
    return sessionId + '|' + frameId
  }

  private async context(sessionId: string, frameId: string): Promise<number | null> {
    const cached = this.contexts.get(this.ck(sessionId, frameId))
    if (cached !== undefined) return cached
    const created = await this.tp.trySend<{ executionContextId: number }>(
      'Page.createIsolatedWorld',
      { frameId, worldName: WORLD, grantUniveralAccess: false },
      sessionId
    )
    if (!created) return null
    this.contexts.set(this.ck(sessionId, frameId), created.executionContextId)
    await this.tp.trySend(
      'Runtime.evaluate',
      { expression: PROBE_SOURCE, contextId: created.executionContextId },
      sessionId
    )
    return created.executionContextId
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
