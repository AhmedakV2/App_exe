import { delay } from '../discovery'
import type { Transport } from '../discovery'
import type { Point, Rect, Viewport } from '../discovery'
import { centerOf, clampPoint, probePoints, sameRect } from './Coordinates'
import { ActionError } from './errors'
import { DEFAULT_ACTIONABILITY, type ActionabilityOptions, type ActionabilityReport } from './types'

interface RemoteState {
  connected: boolean
  rect: Rect
  disabled: boolean
  hidden: boolean
  opacity: number
  pointerEvents: string
  animations: number
  focusable: boolean
}

interface RemoteObject {
  object?: { objectId?: string; value?: unknown }
}

const STATE_FN = `function(){
var rect = this.getBoundingClientRect();
var style = window.getComputedStyle(this);
var animations = typeof this.getAnimations === 'function'
  ? this.getAnimations().filter(function(a){ return a.playState === 'running' }).length
  : 0;
var disabled = this.disabled === true
  || this.getAttribute('aria-disabled') === 'true'
  || this.hasAttribute('inert');
return {
  connected: this.isConnected === true,
  rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
  disabled: disabled,
  hidden: style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse',
  opacity: Number(style.opacity === '' ? 1 : style.opacity),
  pointerEvents: style.pointerEvents,
  animations: animations,
  focusable: this.tabIndex >= 0
}
}`

const SCROLL_FN = `function(){ this.scrollIntoView({ block: 'center', inline: 'center' }) }`

const CONTAINS_FN = `function(other){ return this === other || this.contains(other) }`

export interface ActionabilityTarget {
  sessionId: string
  backendNodeId: number
  frameOffset: Point
  viewport: Viewport
}

export class Actionability {
  constructor(private readonly tp: Transport) {}

  async wait(
    target: ActionabilityTarget,
    overrides: Partial<ActionabilityOptions> = {}
  ): Promise<ActionabilityReport> {
    const options = { ...DEFAULT_ACTIONABILITY, ...overrides }
    const started = Date.now()
    const report = blank()
    let previous: Rect | null = null
    let stableHits = 0
    let scrolled = false

    while (Date.now() - started < options.timeoutMs) {
      report.attempts++
      const objectId = await this.resolve(target)

      if (!objectId) {
        report.reason = 'eleman dokumanda yok'
        await delay(options.pollMs)
        continue
      }

      const state = await this.read(target.sessionId, objectId)
      if (!state || !state.connected) {
        await this.release(target.sessionId, objectId)
        report.reason = 'eleman dokumandan koptu'
        await delay(options.pollMs)
        continue
      }

      const rect = shift(state.rect, target.frameOffset)
      report.rect = rect
      report.visible = !state.hidden && state.opacity > 0 && rect.w >= 1 && rect.h >= 1
      report.enabled = !state.disabled && state.pointerEvents !== 'none'
      report.animationSettled = !options.requireAnimationSettled || state.animations === 0

      stableHits = sameRect(previous, rect, options.stableTolerance) ? stableHits + 1 : 0
      previous = rect
      report.stable = stableHits >= options.stableSamples

      if (
        report.visible &&
        options.scrollIntoView &&
        !scrolled &&
        !this.inside(rect, target.viewport)
      ) {
        scrolled = true
        await this.tp.trySend(
          'Runtime.callFunctionOn',
          { objectId, functionDeclaration: SCROLL_FN },
          target.sessionId
        )
        await this.release(target.sessionId, objectId)
        await delay(options.pollMs)
        continue
      }

      if (report.visible && report.enabled && report.stable && report.animationSettled) {
        const hit = await this.hitTest(target, objectId, rect)
        report.unobstructed = hit.clear || !options.requireUnobstructed
        report.point = hit.point
        if (report.unobstructed && report.point) {
          report.ready = true
          report.reason = 'hazir'
          report.waitedMs = Date.now() - started
          await this.release(target.sessionId, objectId)
          return report
        }
        report.reason = 'eleman ustu kapali'
      } else {
        report.reason = describe(report)
      }

      await this.release(target.sessionId, objectId)
      await delay(options.pollMs)
    }

    report.waitedMs = Date.now() - started
    return report
  }

  async require(
    target: ActionabilityTarget,
    overrides: Partial<ActionabilityOptions> = {}
  ): Promise<ActionabilityReport> {
    const report = await this.wait(target, overrides)
    if (!report.ready) throw new ActionError('element-not-ready', report.reason)
    return report
  }

  private async resolve(target: ActionabilityTarget): Promise<string | null> {
    const resolved = await this.tp.trySend<RemoteObject>(
      'DOM.resolveNode',
      { backendNodeId: target.backendNodeId },
      target.sessionId
    )
    return resolved?.object?.objectId ?? null
  }

  private async read(sessionId: string, objectId: string): Promise<RemoteState | null> {
    const result = await this.tp.trySend<RemoteObject>(
      'Runtime.callFunctionOn',
      { objectId, functionDeclaration: STATE_FN, returnByValue: true },
      sessionId
    )
    const value = result?.object?.value
    return value && typeof value === 'object' ? (value as RemoteState) : null
  }

  private async hitTest(
    target: ActionabilityTarget,
    objectId: string,
    rect: Rect
  ): Promise<{ clear: boolean; point: Point | null }> {
    for (const candidate of probePoints(rect)) {
      const point = clampPoint(candidate, target.viewport)
      const located = await this.tp.trySend<{ backendNodeId?: number }>(
        'DOM.getNodeForLocation',
        { x: Math.round(point.x), y: Math.round(point.y), includeUserAgentShadowDOM: true },
        ''
      )

      if (!located?.backendNodeId) return { clear: true, point }
      if (located.backendNodeId === target.backendNodeId) return { clear: true, point }

      const hit = await this.tp.trySend<RemoteObject>(
        'DOM.resolveNode',
        { backendNodeId: located.backendNodeId },
        target.sessionId
      )
      const hitId = hit?.object?.objectId
      if (!hitId) continue

      const contains = await this.tp.trySend<RemoteObject>(
        'Runtime.callFunctionOn',
        {
          objectId,
          functionDeclaration: CONTAINS_FN,
          arguments: [{ objectId: hitId }],
          returnByValue: true
        },
        target.sessionId
      )
      await this.release(target.sessionId, hitId)
      if (contains?.object?.value === true) return { clear: true, point }
    }

    return { clear: false, point: clampPoint(centerOf(rect), target.viewport) }
  }

  private inside(rect: Rect, viewport: Viewport): boolean {
    return (
      rect.x >= 0 &&
      rect.y >= 0 &&
      rect.x + rect.w <= viewport.width &&
      rect.y + rect.h <= viewport.height
    )
  }

  private async release(sessionId: string, objectId: string): Promise<void> {
    await this.tp.trySend('Runtime.releaseObject', { objectId }, sessionId)
  }
}

function shift(rect: Rect, offset: Point): Rect {
  return { x: rect.x + offset.x, y: rect.y + offset.y, w: rect.w, h: rect.h }
}

function describe(report: ActionabilityReport): string {
  if (!report.visible) return 'eleman gorunur degil'
  if (!report.enabled) return 'eleman etkin degil'
  if (!report.animationSettled) return 'animasyon suruyor'
  if (!report.stable) return 'eleman konumu oturmadi'
  return 'bekleniyor'
}

function blank(): ActionabilityReport {
  return {
    ready: false,
    visible: false,
    enabled: false,
    stable: false,
    unobstructed: false,
    animationSettled: false,
    attempts: 0,
    waitedMs: 0,
    rect: null,
    point: null,
    reason: 'baslamadi'
  }
}
