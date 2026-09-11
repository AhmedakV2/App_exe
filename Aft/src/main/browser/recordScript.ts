const DEFAULT_HOVER_DWELL_MS = 650

export interface WatchTuning {
  hoverDwellMs: number
}

export const DEFAULT_TUNING: WatchTuning = { hoverDwellMs: DEFAULT_HOVER_DWELL_MS }

const SOURCE = `(function () {
  if (window.__aftRecord) return;
  var queue = [];
  var slots = {};
  var seq = 0;
  var bound = [];
  var layer = null;
  var jobs = [];
  var probe = { el: null, seq: 0 };
  var lastPointerAt = 0;
  var lastKeyAt = 0;
  var hoverRaw = null;
  var hoverTimer = null;
  var hoverSent = null;
  var hoverStart = 0;
  var TEST = ['data-testid','data-test-id','data-test','data-qa','data-qa-id','data-cy','data-e2e','data-automation-id','data-automationid','data-tracking-id'];
  var KEYS = ['Enter','Tab','Escape','Backspace','Delete','Insert','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];
  var TYPING_KEYS = ['Backspace','Delete','Insert',' '];
  var MODIFIER_KEYS = ['Shift','Control','Alt','Meta','AltGraph','CapsLock','NumLock','ScrollLock','Dead'];
  var CHANGE_QUIET_MS = 700;
  var PROMOTE_HOPS = 4;
  var PROMOTE_VIEW = 0.5;
  var TONES = { strong: '#3ecf8e', weak: '#f0a02a', blocked: '#ef4444' };
  var HOVER_DWELL_MS = __AFT_HOVER_DWELL__;
  var HOVER_MIN_SIZE = 4;

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

  function parentOf(node) {
    if (!node) return null;
    return node.parentElement || (node.parentNode && node.parentNode.host) || null;
  }

  function areaOf(el) {
    var rect = box(el);
    return rect ? rect.w * rect.h : 0;
  }

  function viewArea() {
    return Math.max(1, (window.innerWidth || 0) * (window.innerHeight || 0));
  }

  function alone(el, name, value) {
    try {
      var root = el.getRootNode ? el.getRootNode() : document;
      if (!root || typeof root.querySelectorAll !== 'function') return false;
      var safe = window.CSS && CSS.escape ? CSS.escape(value) : value;
      return root.querySelectorAll('[' + name + '="' + safe + '"]').length === 1;
    } catch (e) { return false; }
  }

  function speaks(text) {
    if (!text || text.length < 2 || text.length > 64) return false;
    if (/\\d{5,}/.test(text)) return false;
    return /[a-z\\u00c0-\\u024f]/i.test(text);
  }

  function named(el) {
    var mark = testAttribute(el);
    if (mark.value && alone(el, mark.name, mark.value)) return true;
    var id = attr(el, 'id');
    if (id && alone(el, 'id', id)) return true;
    var field = attr(el, 'name');
    if (field && alone(el, 'name', field)) return true;
    var label = attr(el, 'aria-label');
    if (label && alone(el, 'aria-label', label)) return true;
    return speaks(clip(el.innerText || el.textContent, 64));
  }

  function promote(el) {
    if (!el || el.nodeType !== 1 || named(el)) return el;

    var limit = viewArea() * PROMOTE_VIEW;
    var cursor = el;

    for (var hop = 0; hop < PROMOTE_HOPS; hop++) {
      cursor = parentOf(cursor);
      if (!cursor || cursor.nodeType !== 1) return el;
      var tag = (cursor.tagName || '').toLowerCase();
      if (tag === 'body' || tag === 'html') return el;
      if (areaOf(cursor) > limit) return el;
      if (named(cursor)) return cursor;
    }
    return el;
  }

  function pickTarget(event) {
    return promote(pick(event));
  }

  function dwellable(el) {
    if (!el || el.nodeType !== 1) return false;
    var tag = (el.tagName || '').toLowerCase();
    if (tag === 'html' || tag === 'body') return false;
    var rect = box(el);
    return !!rect && rect.w >= HOVER_MIN_SIZE && rect.h >= HOVER_MIN_SIZE;
  }

  function cancelDwell() {
    if (!hoverTimer) return;
    clearTimeout(hoverTimer);
    hoverTimer = null;
  }

  function armDwell(node) {
    hoverRaw = node;
    cancelDwell();
    if (!HOVER_DWELL_MS || !node) return;
    hoverStart = Date.now();
    hoverTimer = setTimeout(function () {
      hoverTimer = null;
      var el = promote(hoverRaw);
      if (!dwellable(el) || el === hoverSent) return;
      hoverSent = el;
      markProbe(el);
      emit('hover', el, { dwellMs: Date.now() - hoverStart });
    }, HOVER_DWELL_MS);
  }

  function post(item) {
    try {
      if (typeof window.__aftRecordSend !== 'function') return false;
      window.__aftRecordSend(JSON.stringify(item));
      return true;
    } catch (e) { return false; }
  }

  function markProbe(el) {
    if (!el) return;
    seq += 1;
    slots[seq] = el;
    probe = { el: el, seq: seq };
    if (!post({ seq: seq, kind: 'probe', at: Date.now(), url: location.href })) {
      delete slots[seq];
      probe = { el: null, seq: 0 };
    }
  }

  function emit(kind, el, extra) {
    seq += 1;
    var reuse = el && probe.el === el ? probe.seq : 0;
    if (el && !reuse) slots[seq] = el;
    var item = {
      seq: seq,
      kind: kind,
      at: Date.now(),
      url: location.href,
      probeSeq: reuse,
      element: describe(el),
      text: '',
      key: '',
      optionValue: '',
      optionLabel: '',
      files: [],
      deltaY: 0,
      dwellMs: 0,
      scrollY: Math.round(window.pageYOffset || 0),
      detail: 0
    };
    if (extra) for (var name in extra) item[name] = extra[name];
    if (post(item)) return;
    queue.push(item);
    if (queue.length > 400) queue.shift();
  }

  function bind(type, target, fn) {
    target.addEventListener(type, fn, true);
    bound.push([type, target, fn]);
  }

  bind('mousedown', document, function (event) {
    cancelDwell();
    var el = pickTarget(event);
    hoverSent = el;
    markProbe(el);
  });

  bind('mousemove', document, function (event) {
    armDwell(pick(event));
  });

  bind('click', document, function (event) {
    if (event.button === 2) return;
    var now = Date.now();
    var forwarded = !event.detail && (now - lastPointerAt < CHANGE_QUIET_MS || now - lastKeyAt < CHANGE_QUIET_MS);
    if (forwarded) return;
    var el = pickTarget(event);
    lastPointerAt = now;
    if (el) emit('click', el, { detail: event.detail || 1 });
  });

  bind('dblclick', document, function (event) {
    var el = pickTarget(event);
    lastPointerAt = Date.now();
    if (el) emit('double-click', el, { detail: 2 });
  });

  bind('contextmenu', document, function (event) {
    var el = pickTarget(event);
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

    cancelDwell();

    var hard = event.ctrlKey || event.altKey || event.metaKey;
    var known = KEYS.indexOf(key) >= 0 || key === ' ';
    if (!hard && !known) return;

    var el = pick(event);
    if (!hard && el && editable(el) && TYPING_KEYS.indexOf(key) >= 0) return;

    lastKeyAt = Date.now();
    emit('key', el, { key: combo(event) });
  });

  bind('wheel', document, function (event) {
    cancelDwell();
    hoverSent = null;
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
      cancelDwell();
      for (var i = 0; i < bound.length; i++) bound[i][1].removeEventListener(bound[i][0], bound[i][2], true);
      for (var j = 0; j < jobs.length; j++) if (jobs[j].timer) clearTimeout(jobs[j].timer);
      bound = [];
      jobs = [];
      queue = [];
      slots = {};
      probe = { el: null, seq: 0 };
      hoverRaw = null;
      hoverSent = null;
      window.__aftRecord.clear();
      try { delete window.__aftRecord; } catch (e) { window.__aftRecord = null; }
    }
  };
})()`

export function sourceFor(tuning: WatchTuning): string {
  const dwell = Math.max(0, Math.round(tuning.hoverDwellMs))
  return SOURCE.replace('__AFT_HOVER_DWELL__', String(dwell))
}

export const DRAIN = 'window.__aftRecord ? JSON.stringify(window.__aftRecord.drain()) : ""'
