import type { Transport } from '../discovery'
import type { HighlightMark, RawInteraction, RawSink } from '../record'

const WORLD = 'aft_record'

const POLL_MS = 120

const SOURCE = `(function () {
  if (window.__aftRecord) return;
  var queue = [];
  var slots = {};
  var seq = 0;
  var bound = [];
  var layer = null;
  var jobs = [];
  var lastPointerAt = 0;
  var lastKeyAt = 0;
  var TEST = ['data-testid','data-test-id','data-test','data-qa','data-qa-id','data-cy','data-e2e','data-automation-id','data-automationid','data-tracking-id'];
  var KEYS = ['Enter','Tab','Escape','Backspace','Delete','Insert','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
  var TYPING_KEYS = ['Backspace','Delete','Insert',' '];
  var MODIFIER_KEYS = ['Shift','Control','Alt','Meta','AltGraph','CapsLock','NumLock','ScrollLock','Dead'];
  var CHANGE_QUIET_MS = 700;
  var TONES = { strong: '#3ecf8e', weak: '#f0a02a', blocked: '#ef4444' };

  function attr(el, name) {
    try { return el.getAttribute(name) || ''; } catch (e) { return ''; }
  }

  function clip(value, size) {
    var text = String(value == null ? '' : value).replace(/\\s+/g, ' ').replace(/^ | $/g, '');
    return text.length > size ? text.slice(0, size) : text;
  }

  function testAttribute(el) {
    for (var i = 0; i < TEST.length; i++) {
      var value = attr(el, TEST[i]);
      if (value) return { name: TEST[i], value: value };
    }
    return { name: '', value: '' };
  }

  function editable(el) {
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'textarea') return true;
    if (tag === 'input') return !/^(checkbox|radio|button|submit|reset|file|image|range|color)$/i.test(el.type || 'text');
    return el.isContentEditable === true;
  }

  function box(el) {
    try {
      var r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    } catch (e) { return null; }
  }

  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    var mark = testAttribute(el);
    return {
      tag: (el.tagName || '').toLowerCase(),
      type: attr(el, 'type'),
      role: attr(el, 'role'),
      elementId: attr(el, 'id'),
      fieldName: attr(el, 'name'),
      testAttribute: mark.name,
      testId: mark.value,
      label: attr(el, 'aria-label') || attr(el, 'title'),
      placeholder: attr(el, 'placeholder'),
      text: clip(el.innerText || el.textContent, 120),
      value: clip(el.value, 200),
      checked: el.checked === true,
      editable: editable(el),
      rect: box(el)
    };
  }

  function combo(event) {
    var name = event.key === ' ' ? 'Space' : event.key;
    var hard = event.ctrlKey || event.altKey || event.metaKey;
    var parts = [];
    if (event.ctrlKey) parts.push('Control');
    if (event.altKey) parts.push('Alt');
    if (event.metaKey) parts.push('Meta');
    if (event.shiftKey && (name.length > 1 || hard)) parts.push('Shift');
    parts.push(name);
    return parts.join('+');
  }

  function scrollJob(node) {
    for (var i = 0; i < jobs.length; i++) if (jobs[i].node === node) return jobs[i];
    var job = { node: node, timer: null, base: scrollTopOf(node), wheel: 0 };
    jobs.push(job);
    if (jobs.length > 32) jobs.shift();
    return job;
  }

  function wheelDelta(event) {
    var value = Number(event.deltaY) || 0;
    if (event.deltaMode === 1) return Math.round(value * 40);
    if (event.deltaMode === 2) return Math.round(value * (window.innerHeight || 800));
    return Math.round(value);
  }

  function scrollTopOf(node) {
    if (!node) return Math.round(window.pageYOffset || 0);
    try { return Math.round(node.scrollTop || 0); } catch (e) { return 0; }
  }

  function scrollHost(node) {
    if (!node || node === document || node === window) return null;
    if (node === document.documentElement || node === document.body) return null;
    return node.nodeType === 1 ? node : null;
  }

  function scrolls(node) {
    try {
      return node.scrollHeight > node.clientHeight + 1 || node.scrollWidth > node.clientWidth + 1;
    } catch (e) { return false; }
  }

  function seedScroll(node) {
    var cursor = node;
    var guard = 0;
    while (cursor && guard < 32) {
      if (scrollHost(cursor) && scrolls(cursor)) return scrollJob(cursor);
      cursor = cursor.parentElement || (cursor.parentNode && cursor.parentNode.host) || null;
      guard++;
    }
    return scrollJob(null);
  }

  function pick(event) {
    var path = typeof event.composedPath === 'function' ? event.composedPath() : null;
    var node = path && path.length ? path[0] : event.target;
    while (node && node.nodeType !== 1) node = node.parentNode || node.host || null;
    return node && node.nodeType === 1 ? node : null;
  }

  function emit(kind, el, extra) {
    seq += 1;
    if (el) slots[seq] = el;
    var item = {
      seq: seq,
      kind: kind,
      at: Date.now(),
      url: location.href,
      element: describe(el),
      text: '',
      key: '',
      optionValue: '',
      optionLabel: '',
      files: [],
      deltaY: 0,
      scrollY: Math.round(window.pageYOffset || 0),
      detail: 0
    };
    if (extra) for (var name in extra) item[name] = extra[name];
    queue.push(item);
    if (queue.length > 400) queue.shift();
  }

  function bind(type, target, fn) {
    target.addEventListener(type, fn, true);
    bound.push([type, target, fn]);
  }

  bind('click', document, function (event) {
    if (event.button === 2) return;
    var now = Date.now();
    var forwarded = !event.detail && (now - lastPointerAt < CHANGE_QUIET_MS || now - lastKeyAt < CHANGE_QUIET_MS);
    if (forwarded) return;
    var el = pick(event);
    lastPointerAt = now;
    if (el) emit('click', el, { detail: event.detail || 1 });
  });

  bind('dblclick', document, function (event) {
    var el = pick(event);
    lastPointerAt = Date.now();
    if (el) emit('double-click', el, { detail: 2 });
  });

  bind('contextmenu', document, function (event) {
    var el = pick(event);
    lastPointerAt = Date.now();
    if (el) emit('right-click', el, {});
  });

  bind('input', document, function (event) {
    var el = pick(event);
    if (!el || !editable(el)) return;
    emit('input', el, { text: clip(el.isContentEditable ? el.innerText : el.value, 400) });
  });

  bind('change', document, function (event) {
    var el = pick(event);
    if (!el) return;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'select') {
      var option = el.options ? el.options[el.selectedIndex] : null;
      emit('select', el, { optionValue: el.value, optionLabel: option ? clip(option.text, 120) : '' });
      return;
    }
    var type = (el.type || '').toLowerCase();
    if (tag === 'input' && type === 'file') {
      var names = [];
      if (el.files) for (var i = 0; i < el.files.length; i++) names.push(el.files[i].name);
      emit('upload', el, { files: names });
      return;
    }
    if (tag === 'input' && (type === 'checkbox' || type === 'radio')) {
      var now = Date.now();
      if (now - lastPointerAt < CHANGE_QUIET_MS) return;
      if (now - lastKeyAt < CHANGE_QUIET_MS) return;
      emit('toggle', el, { detail: el.checked ? 1 : 0 });
    }
  });

  bind('keydown', document, function (event) {
    if (event.repeat) return;
    var key = event.key;
    if (!key || MODIFIER_KEYS.indexOf(key) >= 0) return;

    var hard = event.ctrlKey || event.altKey || event.metaKey;
    var known = KEYS.indexOf(key) >= 0 || key === ' ';
    if (!hard && !known) return;

    var el = pick(event);
    if (!hard && el && editable(el) && TYPING_KEYS.indexOf(key) >= 0) return;

    lastKeyAt = Date.now();
    emit('key', el, { key: combo(event) });
  });

  bind('wheel', document, function (event) {
    seedScroll(pick(event)).wheel += wheelDelta(event);
  });

  bind('scroll', window, function (event) {
    var job = scrollJob(scrollHost(event.target));
    if (job.timer) return;
    job.timer = setTimeout(function () {
      job.timer = null;
      var now = scrollTopOf(job.node);
      var delta = job.wheel || now - job.base;
      job.wheel = 0;
      job.base = now;
      if (delta) emit('scroll', job.node, { deltaY: delta, scrollY: now });
    }, 220);
  });

  scrollJob(null);

  function surface() {
    if (layer && layer.parentNode) return layer;
    layer = document.createElement('div');
    layer.id = '__aft_record_layer';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646';
    (document.body || document.documentElement).appendChild(layer);
    return layer;
  }

  window.__aftRecord = {
    drain: function () { var out = queue; queue = []; return out; },
    node: function (id) { return slots[id] || null; },
    release: function (id) { delete slots[id]; },
    mark: function (rect, label, tone) {
      if (!rect) return;
      var host = surface();
      var frame = document.createElement('div');
      var color = TONES[tone] || TONES.strong;
      frame.style.cssText = 'position:absolute;box-sizing:border-box;border:2px solid ' + color + ';background:transparent;left:' + rect.x + 'px;top:' + rect.y + 'px;width:' + rect.w + 'px;height:' + rect.h + 'px';
      var tag = document.createElement('span');
      tag.textContent = label;
      tag.style.cssText = 'position:absolute;left:0;top:-16px;max-width:320px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:' + color + ';color:#101114;font:600 11px ui-monospace,monospace;padding:1px 5px';
      frame.appendChild(tag);
      host.appendChild(frame);
      setTimeout(function () { if (frame.parentNode) frame.parentNode.removeChild(frame); }, 1500);
    },
    clear: function () {
      if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
      layer = null;
    },
    stop: function () {
      for (var i = 0; i < bound.length; i++) bound[i][1].removeEventListener(bound[i][0], bound[i][2], true);
      for (var j = 0; j < jobs.length; j++) if (jobs[j].timer) clearTimeout(jobs[j].timer);
      bound = [];
      jobs = [];
      queue = [];
      slots = {};
      window.__aftRecord.clear();
      try { delete window.__aftRecord; } catch (e) { window.__aftRecord = null; }
    }
  };
})()`

const DRAIN = 'window.__aftRecord ? JSON.stringify(window.__aftRecord.drain()) : ""'

interface WorldRef {
  sessionId: string
  frameId: string
  contextId: number
}

interface EvalResult {
  result?: { value?: unknown; objectId?: string }
}

interface FrameNode {
  frame?: { id?: string }
  childFrames?: FrameNode[]
}

export class InteractionWatcher {
  private readonly worlds = new Map<string, WorldRef>()
  private readonly scripts = new Map<string, string>()
  private readonly offs: (() => void)[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private sink: RawSink | null = null
  private draining = false
  private active = false

  constructor(private readonly tp: Transport) {}

  async start(sink: RawSink): Promise<void> {
    this.sink = sink
    if (this.active) return
    this.active = true

    this.offs.push(
      this.tp.on('Runtime.executionContextCreated', (params, sessionId) => {
        const context = params['context'] as
          { id?: number; name?: string; auxData?: { frameId?: string } } | undefined
        if (!context || context.name !== WORLD || typeof context.id !== 'number') return
        this.remember(sessionId, String(context.auxData?.frameId ?? ''), context.id)
      })
    )

    this.offs.push(
      this.tp.on('Runtime.executionContextDestroyed', (params, sessionId) => {
        const id = Number(params['executionContextId'])
        if (Number.isFinite(id)) this.worlds.delete(key(sessionId, id))
      })
    )

    this.offs.push(
      this.tp.on('Runtime.executionContextsCleared', (_params, sessionId) => {
        for (const ref of Array.from(this.worlds.values())) {
          if (ref.sessionId === sessionId) this.worlds.delete(key(ref.sessionId, ref.contextId))
        }
      })
    )

    this.offs.push(
      this.tp.on('Target.attachedToTarget', (params) => {
        const attached = String((params['sessionId'] as string | undefined) ?? '')
        if (attached) void this.install(attached).catch(() => undefined)
      })
    )

    for (const sessionId of this.tp.sessions) await this.install(sessionId)
    this.timer = setInterval(() => void this.drain(), POLL_MS)
  }

  async stop(): Promise<void> {
    if (!this.active) return
    this.active = false
    this.sink = null

    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    for (const off of this.offs.splice(0)) off()

    for (const [sessionId, identifier] of Array.from(this.scripts.entries())) {
      await this.tp.trySend('Page.removeScriptToEvaluateOnNewDocument', { identifier }, sessionId)
    }
    this.scripts.clear()

    for (const ref of Array.from(this.worlds.values())) {
      await this.evaluate(ref, 'window.__aftRecord && window.__aftRecord.stop()')
    }
    this.worlds.clear()
  }

  async mark(highlight: HighlightMark): Promise<void> {
    if (!highlight.rect) return

    const ref = this.worldFor(highlight.sessionId, highlight.frameId)
    if (!ref) return

    const call =
      'window.__aftRecord && window.__aftRecord.mark(' +
      JSON.stringify(highlight.rect) +
      ',' +
      JSON.stringify(highlight.label) +
      ',' +
      JSON.stringify(highlight.tone) +
      ')'

    await this.evaluate(ref, call)
  }

  async clearMarks(): Promise<void> {
    for (const ref of Array.from(this.worlds.values())) {
      await this.evaluate(ref, 'window.__aftRecord && window.__aftRecord.clear()')
    }
  }

  private async install(sessionId: string): Promise<void> {
    if (!this.active) return

    const page = await this.tp.trySend('Page.enable', {}, sessionId)
    if (page === null) return
    await this.tp.trySend('Runtime.enable', {}, sessionId)
    await this.tp.trySend('DOM.enable', {}, sessionId)

    if (!this.scripts.has(sessionId)) {
      const added = await this.tp.trySend<{ identifier?: string }>(
        'Page.addScriptToEvaluateOnNewDocument',
        { source: SOURCE, worldName: WORLD, runImmediately: true },
        sessionId
      )
      if (added?.identifier) this.scripts.set(sessionId, added.identifier)
    }

    const tree = await this.tp.trySend<{ frameTree?: FrameNode }>(
      'Page.getFrameTree',
      {},
      sessionId
    )
    if (!tree?.frameTree) return

    for (const frameId of frameIds(tree.frameTree)) {
      const world = await this.tp.trySend<{ executionContextId?: number }>(
        'Page.createIsolatedWorld',
        { frameId, worldName: WORLD, grantUniveralAccess: false },
        sessionId
      )
      if (typeof world?.executionContextId !== 'number') continue

      const ref = this.remember(sessionId, frameId, world.executionContextId)
      await this.evaluate(ref, SOURCE)
    }
  }

  private async drain(): Promise<void> {
    if (this.draining || !this.active) return
    this.draining = true

    try {
      const batch: RawInteraction[] = []

      for (const ref of Array.from(this.worlds.values())) {
        const raw = await this.evaluate(ref, DRAIN, true)
        if (raw === null) {
          this.worlds.delete(key(ref.sessionId, ref.contextId))
          continue
        }

        const value = raw.result?.value
        if (typeof value !== 'string' || value.length < 3) continue

        for (const item of parse(value)) batch.push(await this.hydrate(ref, item))
      }

      if (batch.length && this.sink) this.sink(batch)
    } finally {
      this.draining = false
    }
  }

  private async hydrate(ref: WorldRef, item: Record<string, unknown>): Promise<RawInteraction> {
    const seq = Number(item['seq'] ?? 0)
    const element = item['element'] as RawInteraction['element']
    const backendNodeId = element ? await this.resolve(ref, seq) : 0

    return {
      seq,
      kind: item['kind'] as RawInteraction['kind'],
      at: Number(item['at'] ?? Date.now()),
      url: String(item['url'] ?? ''),
      sessionId: ref.sessionId,
      frameId: ref.frameId,
      backendNodeId,
      element,
      text: String(item['text'] ?? ''),
      key: String(item['key'] ?? ''),
      optionValue: String(item['optionValue'] ?? ''),
      optionLabel: String(item['optionLabel'] ?? ''),
      files: Array.isArray(item['files']) ? (item['files'] as string[]) : [],
      deltaY: Number(item['deltaY'] ?? 0),
      scrollY: Number(item['scrollY'] ?? 0),
      detail: Number(item['detail'] ?? 0)
    }
  }

  private async resolve(ref: WorldRef, seq: number): Promise<number> {
    const handle = await this.evaluate(ref, 'window.__aftRecord.node(' + seq + ')')
    const objectId = handle?.result?.objectId
    if (!objectId) return 0

    const described = await this.tp.trySend<{ node?: { backendNodeId?: number } }>(
      'DOM.describeNode',
      { objectId },
      ref.sessionId
    )

    await this.tp.trySend('Runtime.releaseObject', { objectId }, ref.sessionId)
    await this.evaluate(ref, 'window.__aftRecord.release(' + seq + ')')

    return described?.node?.backendNodeId ?? 0
  }

  private evaluate(ref: WorldRef, expression: string, byValue = false): Promise<EvalResult | null> {
    return this.tp.trySend<EvalResult>(
      'Runtime.evaluate',
      { expression, contextId: ref.contextId, returnByValue: byValue, awaitPromise: false },
      ref.sessionId
    )
  }

  private remember(sessionId: string, frameId: string, contextId: number): WorldRef {
    const ref: WorldRef = { sessionId, frameId, contextId }
    this.worlds.set(key(sessionId, contextId), ref)
    return ref
  }

  private worldFor(sessionId: string, frameId: string): WorldRef | null {
    for (const ref of this.worlds.values()) {
      if (ref.sessionId === sessionId && ref.frameId === frameId) return ref
    }
    for (const ref of this.worlds.values()) {
      if (ref.sessionId === sessionId) return ref
    }
    return null
  }
}

function key(sessionId: string, contextId: number): string {
  return sessionId + '|' + contextId
}

function frameIds(node: FrameNode): string[] {
  const out: string[] = []
  const id = node.frame?.id
  if (id) out.push(id)
  for (const child of node.childFrames ?? []) out.push(...frameIds(child))
  return out
}

function parse(value: string): Record<string, unknown>[] {
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? (parsed as Record<string, unknown>[]) : []
  } catch {
    return []
  }
}
