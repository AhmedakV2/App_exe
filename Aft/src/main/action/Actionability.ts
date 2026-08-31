import { delay } from '../discovery'
import type { Transport } from '../discovery'
import type { Point, Rect, Viewport } from '../discovery'
import { PROBE_STEPS, centerOf, clampPoint } from './Coordinates'
import { sameRect } from './Coordinates'
import { ActionError } from './errors'
import { DEFAULT_ACTIONABILITY, type ActionabilityOptions, type ActionabilityReport } from './types'

interface RemoteHit {
  clear: boolean
  x: number
  y: number
}

interface RemoteState {
  connected: boolean
  rect: Rect
  disabled: boolean
  hidden: boolean
  opacity: number
  pointerEvents: string
  animations: number
  focusable: boolean
  scrolled: boolean
  hit: RemoteHit | null
}

interface ResolvedNode {
  object?: { objectId?: string }
}

interface CallResult {
  result?: { value?: unknown }
}

const PROBE_FN = `function(config){
var rect = this.getBoundingClientRect();
var style = window.getComputedStyle(this);
var animations = typeof this.getAnimations === 'function'
  ? this.getAnimations().filter(function(a){ return a.playState === 'running' }).length
  : 0;
var disabled = this.disabled === true
  || this.getAttribute('aria-disabled') === 'true'
  || this.hasAttribute('inert');
var hidden = style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
var opacity = Number(style.opacity === '' ? 1 : style.opacity);
var box = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
var state = {
  connected: this.isConnected === true,
  rect: box,
  disabled: disabled,
  hidden: hidden,
  opacity: opacity,
  pointerEvents: style.pointerEvents,
  animations: animations,
  focusable: this.tabIndex >= 0,
  scrolled: false,
  hit: null
};

var visible = !hidden && opacity > 0 && box.w >= 1 && box.h >= 1;
if (!state.connected || !visible) return state;

var ox = config.offsetX;
var oy = config.offsetY;
var vw = config.width;
var vh = config.height;
var shifted = { x: box.x + ox, y: box.y + oy, w: box.w, h: box.h };

if (config.scroll) {
  var inside = shifted.x >= 0 && shifted.y >= 0
    && shifted.x + shifted.w <= vw && shifted.y + shifted.h <= vh;
  if (!inside) {
    this.scrollIntoView({ block: 'center', inline: 'center' });
    state.scrolled = true;
    return state;
  }
}

var round2 = function(value){ return Math.round(value * 100) / 100 };
var clamp = function(value, min, max){ return Math.min(max, Math.max(min, value)) };
var inset = config.inset;
var steps = config.steps;
var root = this.getRootNode();
var host = root && typeof root.elementFromPoint === 'function' ? root : document;
var self = this;

var contains = function(node){
  if (!node) return false;
  if (node === self || self.contains(node)) return true;
  var cursor = node;
  var guard = 0;
  while (cursor && guard < 64) {
    if (cursor === self) return true;
    cursor = cursor.parentNode && cursor.parentNode.host ? cursor.parentNode.host : cursor.parentElement;
    guard++;
  }
  return node.contains(self) === true;
};

for (var i = 0; i < steps.length; i++) {
  var px = round2(clamp(shifted.x + shifted.w * steps[i][0], shifted.x + inset, shifted.x + shifted.w - inset));
  var py = round2(clamp(shifted.y + shifted.h * steps[i][1], shifted.y + inset, shifted.y + shifted.h - inset));
  px = round2(clamp(px, 1, Math.max(1, vw - 1)));
  py = round2(clamp(py, 1, Math.max(1, vh - 1)));
  if (contains(host.elementFromPoint(px - ox, py - oy))) {
    state.hit = { clear: true, x: px, y: py };
    return state;
  }
}

state.hit = { clear: false, x: 0, y: 0 };
return state;
}`

export interface ActionabilityTarget {
  sessionId: string
  backendNodeId: number
  frameOffset: Point
  viewport: Viewport
}

const EDGE_INSET = 2

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
    let objectId = ''

    try {
      while (Date.now() - started < options.timeoutMs) {
        report.attempts++

        if (!objectId) {
          objectId = (await this.resolve(target)) ?? ''
          if (!objectId) {
            report.reason = 'eleman dokumanda yok'
            await delay(options.pollMs)
            continue
          }
        }

        const state = await this.probe(target, objectId, options, !scrolled)
        if (!state) {
          await this.release(target.sessionId, objectId)
          objectId = ''
          report.reason = 'eleman dokumanda yok'
          await delay(options.pollMs)
          continue
        }
        if (!state.connected) {
          await this.release(target.sessionId, objectId)
          objectId = ''
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

        if (state.scrolled) {
          scrolled = true
          await delay(options.pollMs)
          continue
        }

        if (report.visible && report.enabled && report.stable && report.animationSettled) {
          const clear = state.hit?.clear === true
          report.unobstructed = clear || !options.requireUnobstructed
          report.point =
            state.hit && clear
              ? { x: state.hit.x, y: state.hit.y }
              : clampPoint(centerOf(rect), target.viewport)

          if (report.unobstructed && report.point) {
            report.ready = true
            report.reason = 'hazir'
            report.waitedMs = Date.now() - started
            return report
          }
          report.reason = 'eleman ustu kapali'
        } else {
          report.reason = describe(report)
        }

        await delay(options.pollMs)
      }

      report.waitedMs = Date.now() - started
      if (!report.point && report.rect) {
        report.point = clampPoint(centerOf(report.rect), target.viewport)
      }
      return report
    } finally {
      if (objectId) await this.release(target.sessionId, objectId)
    }
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
    const resolved = await this.tp.trySend<ResolvedNode>(
      'DOM.resolveNode',
      { backendNodeId: target.backendNodeId },
      target.sessionId
    )
    return resolved?.object?.objectId ?? null
  }

  private async probe(
    target: ActionabilityTarget,
    objectId: string,
    options: ActionabilityOptions,
    allowScroll: boolean
  ): Promise<RemoteState | null> {
    const config = {
      offsetX: target.frameOffset.x,
      offsetY: target.frameOffset.y,
      width: target.viewport.width,
      height: target.viewport.height,
      inset: EDGE_INSET,
      scroll: options.scrollIntoView && allowScroll,
      steps: PROBE_STEPS.map((step) => [step.x, step.y])
    }

    const result = await this.tp.trySend<CallResult>(
      'Runtime.callFunctionOn',
      {
        objectId,
        functionDeclaration: PROBE_FN,
        arguments: [{ value: config }],
        returnByValue: true
      },
      target.sessionId
    )

    const value = result?.result?.value
    return value && typeof value === 'object' ? (value as RemoteState) : null
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
