import type { Transport } from '../discovery'
import type { ElementGraph } from '../discovery'

const WORLD = 'aft_overlay'

const DRAW = (json: string): string => `(function(){
var old = document.getElementById('__aft_overlay'); if (old) old.remove();
var ov = document.createElement('div');
ov.id = '__aft_overlay';
ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
JSON.parse(${JSON.stringify(json)}).forEach(function(it){
  var b = document.createElement('div');
  b.style.cssText = 'position:absolute;border:2px solid #ef6c1a;left:'+it.x+'px;top:'+it.y+'px;width:'+it.w+'px;height:'+it.h+'px';
  var l = document.createElement('span');
  l.textContent = String(it.i);
  l.style.cssText = 'position:absolute;top:-15px;left:0;background:#ef6c1a;color:#fff;font:11px monospace;padding:0 4px';
  b.appendChild(l); ov.appendChild(b);
});
document.body.appendChild(ov);
})()`

const CLEAR = `(function(){ var o = document.getElementById('__aft_overlay'); if (o) o.remove(); })()`

export class Overlay {
  private readonly contexts = new Map<string, number>()

  constructor(private readonly tp: Transport) {}

  async draw(graph: ElementGraph): Promise<void> {
    const root = graph.frames.find((f) => !f.parentFrameId)
    if (!root) return
    const items = graph
      .project('record')
      .candidates.map((c) => ({ i: c.index, x: c.rect.x, y: c.rect.y, w: c.rect.w, h: c.rect.h }))
    await this.run(root.sessionId, root.frameId, DRAW(JSON.stringify(items)))
  }

  async clear(graph: ElementGraph | null): Promise<void> {
    const root = graph?.frames.find((f) => !f.parentFrameId)
    if (!root) return
    await this.run(root.sessionId, root.frameId, CLEAR)
  }

  private async run(sessionId: string, frameId: string, expression: string): Promise<void> {
    const key = sessionId + '|' + frameId
    let contextId = this.contexts.get(key)
    if (contextId === undefined) {
      const world = await this.tp.trySend<{ executionContextId: number }>(
        'Page.createIsolatedWorld',
        { frameId, worldName: WORLD, grantUniveralAccess: false },
        sessionId
      )
      if (!world) return
      contextId = world.executionContextId
      this.contexts.set(key, contextId)
    }
    const res = await this.tp.trySend('Runtime.evaluate', { expression, contextId }, sessionId)
    if (res === null) this.contexts.delete(key)
  }
}
