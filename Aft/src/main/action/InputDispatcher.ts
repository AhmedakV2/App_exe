import { delay } from '../discovery'
import type { Transport } from '../discovery'
import type { Point } from '../discovery'
import { ActionError } from './errors'

interface KeyDefinition {
  windowsVirtualKeyCode: number
  key: string
  code: string
  text: string
}

const NAMED_KEYS: Record<string, KeyDefinition> = {
  enter: { windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
  return: { windowsVirtualKeyCode: 13, key: 'Enter', code: 'Enter', text: '\r' },
  numpadenter: { windowsVirtualKeyCode: 13, key: 'Enter', code: 'NumpadEnter', text: '\r' },
  tab: { windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab', text: '\t' },
  space: { windowsVirtualKeyCode: 32, key: ' ', code: 'Space', text: ' ' },
  spacebar: { windowsVirtualKeyCode: 32, key: ' ', code: 'Space', text: ' ' },
  ' ': { windowsVirtualKeyCode: 32, key: ' ', code: 'Space', text: ' ' },
  escape: { windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape', text: '' },
  esc: { windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape', text: '' },
  backspace: { windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace', text: '' },
  delete: { windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete', text: '' },
  del: { windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete', text: '' },
  insert: { windowsVirtualKeyCode: 45, key: 'Insert', code: 'Insert', text: '' },
  arrowup: { windowsVirtualKeyCode: 38, key: 'ArrowUp', code: 'ArrowUp', text: '' },
  arrowdown: { windowsVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown', text: '' },
  arrowleft: { windowsVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft', text: '' },
  arrowright: { windowsVirtualKeyCode: 39, key: 'ArrowRight', code: 'ArrowRight', text: '' },
  up: { windowsVirtualKeyCode: 38, key: 'ArrowUp', code: 'ArrowUp', text: '' },
  down: { windowsVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown', text: '' },
  left: { windowsVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft', text: '' },
  right: { windowsVirtualKeyCode: 39, key: 'ArrowRight', code: 'ArrowRight', text: '' },
  home: { windowsVirtualKeyCode: 36, key: 'Home', code: 'Home', text: '' },
  end: { windowsVirtualKeyCode: 35, key: 'End', code: 'End', text: '' },
  pageup: { windowsVirtualKeyCode: 33, key: 'PageUp', code: 'PageUp', text: '' },
  pagedown: { windowsVirtualKeyCode: 34, key: 'PageDown', code: 'PageDown', text: '' },
  f1: { windowsVirtualKeyCode: 112, key: 'F1', code: 'F1', text: '' },
  f2: { windowsVirtualKeyCode: 113, key: 'F2', code: 'F2', text: '' },
  f3: { windowsVirtualKeyCode: 114, key: 'F3', code: 'F3', text: '' },
  f4: { windowsVirtualKeyCode: 115, key: 'F4', code: 'F4', text: '' },
  f5: { windowsVirtualKeyCode: 116, key: 'F5', code: 'F5', text: '' },
  f6: { windowsVirtualKeyCode: 117, key: 'F6', code: 'F6', text: '' },
  f7: { windowsVirtualKeyCode: 118, key: 'F7', code: 'F7', text: '' },
  f8: { windowsVirtualKeyCode: 119, key: 'F8', code: 'F8', text: '' },
  f9: { windowsVirtualKeyCode: 120, key: 'F9', code: 'F9', text: '' },
  f10: { windowsVirtualKeyCode: 121, key: 'F10', code: 'F10', text: '' },
  f11: { windowsVirtualKeyCode: 122, key: 'F11', code: 'F11', text: '' },
  f12: { windowsVirtualKeyCode: 123, key: 'F12', code: 'F12', text: '' }
}

const MODIFIER_KEYS: Record<string, { mask: number; definition: KeyDefinition }> = {
  alt: {
    mask: 1,
    definition: { windowsVirtualKeyCode: 18, key: 'Alt', code: 'AltLeft', text: '' }
  },
  control: {
    mask: 2,
    definition: { windowsVirtualKeyCode: 17, key: 'Control', code: 'ControlLeft', text: '' }
  },
  ctrl: {
    mask: 2,
    definition: { windowsVirtualKeyCode: 17, key: 'Control', code: 'ControlLeft', text: '' }
  },
  meta: {
    mask: 4,
    definition: { windowsVirtualKeyCode: 91, key: 'Meta', code: 'MetaLeft', text: '' }
  },
  command: {
    mask: 4,
    definition: { windowsVirtualKeyCode: 91, key: 'Meta', code: 'MetaLeft', text: '' }
  },
  cmd: {
    mask: 4,
    definition: { windowsVirtualKeyCode: 91, key: 'Meta', code: 'MetaLeft', text: '' }
  },
  os: {
    mask: 4,
    definition: { windowsVirtualKeyCode: 91, key: 'Meta', code: 'MetaLeft', text: '' }
  },
  shift: {
    mask: 8,
    definition: { windowsVirtualKeyCode: 16, key: 'Shift', code: 'ShiftLeft', text: '' }
  }
}

export function isPressableKey(name: string): boolean {
  return parseCombo(name) !== null
}

const HOVER_APPROACH_MS = 40

const HOVER_APPROACH_PX = 24

const CLICK_FN = `function(){ if (typeof this.click === 'function') this.click() }`

const CLEAR_FN = `function(){
if ('value' in this) {
  this.value = '';
  this.dispatchEvent(new Event('input', { bubbles: true }));
  this.dispatchEvent(new Event('change', { bubbles: true }));
} else if (this.isContentEditable) {
  this.textContent = '';
  this.dispatchEvent(new Event('input', { bubbles: true }));
}
}`

const SET_VALUE_FN = `function(value){
if ('value' in this) {
  var setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(this), 'value');
  if (setter && setter.set) setter.set.call(this, value);
  else this.value = value;
} else if (this.isContentEditable) {
  this.textContent = value;
}
this.dispatchEvent(new Event('input', { bubbles: true }));
this.dispatchEvent(new Event('change', { bubbles: true }));
}`

const READ_VALUE_FN = `function(){
if ('value' in this) return String(this.value);
if (this.isContentEditable) return String(this.textContent || '');
return '';
}`

const SELECT_FN = `function(value){
var host = this.tagName === 'SELECT' ? this : null;
if (!host && typeof this.querySelector === 'function') host = this.querySelector('select');
if (!host) {
  var cursor = this.parentElement;
  var guard = 0;
  while (cursor && guard < 16) {
    if (cursor.tagName === 'SELECT') { host = cursor; break; }
    cursor = cursor.parentElement;
    guard++;
  }
}
if (!host) return 'no-select';
var found = Array.prototype.find.call(host.options, function(option){
  return option.value === value || option.label === value || option.textContent.trim() === value;
});
if (!found) return 'no-option';
host.value = found.value;
host.selectedIndex = found.index;
host.dispatchEvent(new Event('input', { bubbles: true }));
host.dispatchEvent(new Event('change', { bubbles: true }));
return 'ok';
}`

const DOUBLE_CLICK_FN = `function(){
var options = { bubbles: true, cancelable: true, view: window };
this.dispatchEvent(new MouseEvent('mousedown', options));
this.dispatchEvent(new MouseEvent('mouseup', options));
this.dispatchEvent(new MouseEvent('click', Object.assign({ detail: 1 }, options)));
this.dispatchEvent(new MouseEvent('mousedown', options));
this.dispatchEvent(new MouseEvent('mouseup', options));
this.dispatchEvent(new MouseEvent('click', Object.assign({ detail: 2 }, options)));
this.dispatchEvent(new MouseEvent('dblclick', Object.assign({ detail: 2 }, options)));
}`

const CONTEXT_MENU_FN = `function(){
var options = { bubbles: true, cancelable: true, view: window, button: 2, buttons: 2 };
this.dispatchEvent(new MouseEvent('mousedown', options));
this.dispatchEvent(new MouseEvent('mouseup', options));
this.dispatchEvent(new MouseEvent('contextmenu', options));
}`

const SCROLL_BY_FN = `function(deltaY){
var before = this.scrollTop;
this.scrollTop = before + deltaY;
if (this.scrollTop !== before) return true;
var cursor = this.parentElement;
var guard = 0;
while (cursor && guard < 32) {
  var mark = cursor.scrollTop;
  cursor.scrollTop = mark + deltaY;
  if (cursor.scrollTop !== mark) return true;
  cursor = cursor.parentElement;
  guard++;
}
return false;
}`

const READ_SCROLL_FN = `function(){
var cursor = this;
var guard = 0;
while (cursor && guard < 32) {
  if (cursor.scrollHeight > cursor.clientHeight + 1) return cursor.scrollTop;
  cursor = cursor.parentElement;
  guard++;
}
return Math.round(window.pageYOffset || 0);
}`

const FOCUS_INTO_FN = `function(){
if (typeof this.focus !== 'function') return false;
this.focus({ preventScroll: true });
var root = this.getRootNode();
var active = root && root.activeElement ? root.activeElement : document.activeElement;
return active === this || (this.contains && active ? this.contains(active) : false);
}`

export class InputDispatcher {
  constructor(private readonly tp: Transport) {}

  async move(point: Point): Promise<void> {
    await this.mouse('mouseMoved', point, 'none', 0)
  }

  async hover(point: Point, holdMs: number): Promise<void> {
    await this.move(approachOf(point))
    await delay(HOVER_APPROACH_MS)
    await this.move(point)
    if (holdMs > 0) await delay(holdMs)
  }

  async click(point: Point, button: 'left' | 'right' = 'left', clicks = 1): Promise<void> {
    await this.move(point)
    await this.mouse('mousePressed', point, button, clicks)
    await delay(24)
    await this.mouse('mouseReleased', point, button, clicks)
  }

  async doubleClick(point: Point): Promise<void> {
    await this.click(point, 'left', 1)
    await delay(40)
    await this.mouse('mousePressed', point, 'left', 2)
    await delay(24)
    await this.mouse('mouseReleased', point, 'left', 2)
  }

  async scroll(point: Point, deltaY: number): Promise<void> {
    await this.tp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: point.x,
      y: point.y,
      deltaX: 0,
      deltaY,
      pointerType: 'mouse'
    })
  }

  async typeText(text: string, delayMs: number): Promise<void> {
    for (const character of Array.from(text)) {
      await this.typeCharacter(character)
      if (delayMs > 0) await delay(delayMs)
    }
  }

  private async typeCharacter(character: string): Promise<void> {
    const definition = printable(character)
    if (!definition || !definition.code) {
      await this.tp.send('Input.insertText', { text: character })
      return
    }

    await this.tp.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      windowsVirtualKeyCode: definition.windowsVirtualKeyCode,
      key: definition.key,
      code: definition.code,
      text: definition.text,
      unmodifiedText: definition.text
    })
    await this.tp.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      windowsVirtualKeyCode: definition.windowsVirtualKeyCode,
      key: definition.key,
      code: definition.code
    })
  }

  async press(name: string, sessionId = ''): Promise<void> {
    const combo = parseCombo(name)
    if (!combo) throw new ActionError('not-supported', 'Bilinmeyen tus: ' + name)

    const definition = combo.definition
    const text = combo.mask & ~SHIFT_MASK ? '' : definition.text

    for (const modifier of combo.modifiers) {
      await this.key('rawKeyDown', modifier.definition, '', maskUpTo(combo, modifier), sessionId)
    }

    await this.key(text ? 'keyDown' : 'rawKeyDown', definition, text, combo.mask, sessionId)
    await this.key('keyUp', definition, '', combo.mask, sessionId)

    for (const modifier of combo.modifiers.slice().reverse()) {
      await this.key('keyUp', modifier.definition, '', 0, sessionId)
    }
  }

  private async key(
    type: string,
    definition: KeyDefinition,
    text: string,
    modifiers: number,
    sessionId: string
  ): Promise<void> {
    await this.tp.send(
      'Input.dispatchKeyEvent',
      {
        type,
        modifiers,
        windowsVirtualKeyCode: definition.windowsVirtualKeyCode,
        nativeVirtualKeyCode: definition.windowsVirtualKeyCode,
        key: definition.key,
        code: definition.code,
        text,
        unmodifiedText: text
      },
      sessionId
    )
  }

  async clear(sessionId: string, objectId: string): Promise<void> {
    await this.call(sessionId, objectId, CLEAR_FN)
  }

  async directClick(sessionId: string, objectId: string): Promise<void> {
    await this.call(sessionId, objectId, CLICK_FN)
  }

  async directDoubleClick(sessionId: string, objectId: string): Promise<void> {
    await this.call(sessionId, objectId, DOUBLE_CLICK_FN)
  }

  async directContextMenu(sessionId: string, objectId: string): Promise<void> {
    await this.call(sessionId, objectId, CONTEXT_MENU_FN)
  }

  async directScroll(sessionId: string, objectId: string, deltaY: number): Promise<boolean> {
    const result = await this.tp.trySend<{ result?: { value?: unknown } }>(
      'Runtime.callFunctionOn',
      {
        objectId,
        functionDeclaration: SCROLL_BY_FN,
        arguments: [{ value: deltaY }],
        returnByValue: true
      },
      sessionId
    )
    return result?.result?.value === true
  }

  async readScrollTop(sessionId: string, objectId: string): Promise<number | null> {
    const result = await this.tp.trySend<{ result?: { value?: unknown } }>(
      'Runtime.callFunctionOn',
      { objectId, functionDeclaration: READ_SCROLL_FN, returnByValue: true },
      sessionId
    )
    const value = result?.result?.value
    return typeof value === 'number' ? value : null
  }

  async focusInto(sessionId: string, objectId: string): Promise<boolean> {
    const result = await this.tp.trySend<{ result?: { value?: unknown } }>(
      'Runtime.callFunctionOn',
      { objectId, functionDeclaration: FOCUS_INTO_FN, returnByValue: true },
      sessionId
    )
    return result?.result?.value === true
  }

  async directSetValue(sessionId: string, objectId: string, value: string): Promise<void> {
    await this.call(sessionId, objectId, SET_VALUE_FN, [{ value }])
  }

  async readValue(sessionId: string, objectId: string): Promise<string | null> {
    const result = await this.tp.trySend<{ result?: { value?: unknown } }>(
      'Runtime.callFunctionOn',
      { objectId, functionDeclaration: READ_VALUE_FN, returnByValue: true },
      sessionId
    )
    const value = result?.result?.value
    return typeof value === 'string' ? value : null
  }

  async selectOption(sessionId: string, objectId: string, value: string): Promise<string> {
    const result = await this.tp.trySend<{ result?: { value?: unknown } }>(
      'Runtime.callFunctionOn',
      {
        objectId,
        functionDeclaration: SELECT_FN,
        arguments: [{ value }],
        returnByValue: true
      },
      sessionId
    )
    const outcome = result?.result?.value
    return typeof outcome === 'string' ? outcome : 'no-select'
  }

  async setFiles(sessionId: string, backendNodeId: number, files: string[]): Promise<void> {
    await this.tp.send('DOM.setFileInputFiles', { files, backendNodeId }, sessionId)
  }

  private async mouse(
    type: string,
    point: Point,
    button: string,
    clickCount: number
  ): Promise<void> {
    await this.tp.send('Input.dispatchMouseEvent', {
      type,
      x: point.x,
      y: point.y,
      button,
      clickCount,
      buttons: type === 'mousePressed' ? buttonMask(button) : 0,
      pointerType: 'mouse'
    })
  }

  private async call(
    sessionId: string,
    objectId: string,
    functionDeclaration: string,
    args: { value: string }[] = []
  ): Promise<void> {
    await this.tp.send(
      'Runtime.callFunctionOn',
      { objectId, functionDeclaration, arguments: args, returnByValue: true },
      sessionId
    )
  }
}

function approachOf(point: Point): Point {
  return {
    x: Math.max(0, Math.round(point.x - HOVER_APPROACH_PX)),
    y: Math.max(0, Math.round(point.y - HOVER_APPROACH_PX))
  }
}

const SHIFT_MASK = 8

interface KeyCombo {
  definition: KeyDefinition
  modifiers: { mask: number; definition: KeyDefinition }[]
  mask: number
}

function parseCombo(name: string): KeyCombo | null {
  const raw = name.trim()
  if (!raw) return null

  const parts = raw.length > 1 ? raw.split('+').filter((part) => part !== '') : [raw]
  if (!parts.length) return null

  const base = parts[parts.length - 1]
  const modifiers: { mask: number; definition: KeyDefinition }[] = []
  let mask = 0

  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_KEYS[part.trim().toLowerCase()]
    if (!modifier) return null
    if (modifiers.some((entry) => entry.mask === modifier.mask)) continue
    modifiers.push(modifier)
    mask |= modifier.mask
  }

  const definition = NAMED_KEYS[base.trim().toLowerCase()] ?? printable(base)
  if (!definition) return null

  return { definition, modifiers, mask }
}

function maskUpTo(combo: KeyCombo, modifier: { mask: number }): number {
  let mask = 0
  for (const entry of combo.modifiers) {
    mask |= entry.mask
    if (entry.mask === modifier.mask) break
  }
  return mask
}

function printable(name: string): KeyDefinition | null {
  if (Array.from(name).length !== 1) return null
  const upper = name.toUpperCase()
  const point = upper.charCodeAt(0)

  return {
    windowsVirtualKeyCode: point,
    key: name,
    code: codeOf(name, upper),
    text: name
  }
}

function codeOf(name: string, upper: string): string {
  if (name >= '0' && name <= '9') return 'Digit' + name
  if (upper >= 'A' && upper <= 'Z') return 'Key' + upper
  if (name === ' ') return 'Space'
  return ''
}

function buttonMask(button: string): number {
  if (button === 'right') return 2
  if (button === 'middle') return 4
  return 1
}
