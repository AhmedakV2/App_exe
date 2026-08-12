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
  tab: { windowsVirtualKeyCode: 9, key: 'Tab', code: 'Tab', text: '\t' },
  space: { windowsVirtualKeyCode: 32, key: ' ', code: 'Space', text: ' ' },
  escape: { windowsVirtualKeyCode: 27, key: 'Escape', code: 'Escape', text: '' },
  backspace: { windowsVirtualKeyCode: 8, key: 'Backspace', code: 'Backspace', text: '' },
  delete: { windowsVirtualKeyCode: 46, key: 'Delete', code: 'Delete', text: '' },
  arrowup: { windowsVirtualKeyCode: 38, key: 'ArrowUp', code: 'ArrowUp', text: '' },
  arrowdown: { windowsVirtualKeyCode: 40, key: 'ArrowDown', code: 'ArrowDown', text: '' },
  arrowleft: { windowsVirtualKeyCode: 37, key: 'ArrowLeft', code: 'ArrowLeft', text: '' },
  arrowright: { windowsVirtualKeyCode: 39, key: 'ArrowRight', code: 'ArrowRight', text: '' },
  home: { windowsVirtualKeyCode: 36, key: 'Home', code: 'Home', text: '' },
  end: { windowsVirtualKeyCode: 35, key: 'End', code: 'End', text: '' },
  pageup: { windowsVirtualKeyCode: 33, key: 'PageUp', code: 'PageUp', text: '' },
  pagedown: { windowsVirtualKeyCode: 34, key: 'PageDown', code: 'PageDown', text: '' }
}

const FOCUS_FN = `function(){ if (typeof this.focus === 'function') this.focus({ preventScroll: true }) }`

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

const SELECT_FN = `function(value){
if (this.tagName !== 'SELECT') return false;
var found = Array.prototype.find.call(this.options, function(option){
  return option.value === value || option.label === value || option.textContent.trim() === value;
});
if (!found) return false;
this.value = found.value;
this.dispatchEvent(new Event('input', { bubbles: true }));
this.dispatchEvent(new Event('change', { bubbles: true }));
return true;
}`

export class InputDispatcher {
  constructor(private readonly tp: Transport) {}

  async move(point: Point): Promise<void> {
    await this.mouse('mouseMoved', point, 'none', 0)
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
      await this.tp.send('Input.insertText', { text: character })
      if (delayMs > 0) await delay(delayMs)
    }
  }

  async press(name: string): Promise<void> {
    const definition = NAMED_KEYS[name.toLowerCase()] ?? printable(name)
    if (!definition) throw new ActionError('not-supported', 'Bilinmeyen tus: ' + name)

    await this.tp.send('Input.dispatchKeyEvent', {
      type: definition.text ? 'keyDown' : 'rawKeyDown',
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

  async focus(sessionId: string, objectId: string): Promise<void> {
    await this.call(sessionId, objectId, FOCUS_FN)
  }

  async clear(sessionId: string, objectId: string): Promise<void> {
    await this.call(sessionId, objectId, CLEAR_FN)
  }

  async directClick(sessionId: string, objectId: string): Promise<void> {
    await this.call(sessionId, objectId, CLICK_FN)
  }

  async directSetValue(sessionId: string, objectId: string, value: string): Promise<void> {
    await this.call(sessionId, objectId, SET_VALUE_FN, [{ value }])
  }

  async selectOption(sessionId: string, objectId: string, value: string): Promise<boolean> {
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
    return result?.result?.value === true
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

function printable(name: string): KeyDefinition | null {
  if (Array.from(name).length !== 1) return null
  const code = name.toUpperCase().charCodeAt(0)
  return {
    windowsVirtualKeyCode: code,
    key: name,
    code: 'Key' + name.toUpperCase(),
    text: name
  }
}

function buttonMask(button: string): number {
  if (button === 'right') return 2
  if (button === 'middle') return 4
  return 1
}
