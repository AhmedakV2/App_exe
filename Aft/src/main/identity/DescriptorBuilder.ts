import { digest } from '../model'
import type { ModelIndex } from '../model'
import type { ElementModel } from '../model'
import { qualityOf } from './Scoring'
import {
  ancestorSignature,
  formSignature,
  labelOf,
  neighborSignature,
  urlPattern
} from './signature'
import { STRATEGY_CHAIN } from './strategies'
import { normalizeText } from './dynamic'
import {
  DESCRIPTOR_VERSION,
  type Descriptor,
  type DescriptorContext,
  type DescriptorTarget,
  type StrategyPayload
} from './types'

export class DescriptorBuilder {
  build(ref: string, index: ModelIndex): Descriptor {
    const element = index.get(ref)
    if (!element) throw new Error('Descriptor uretilemedi, eleman bulunamadi: ' + ref)
    return this.fromElement(element, index)
  }

  fromElement(element: ElementModel, index: ModelIndex): Descriptor {
    const strategies = this.collect(element, index)
    const context = this.contextOf(element, index)
    const target = this.targetOf(element)

    return {
      version: DESCRIPTOR_VERSION,
      id: digest([
        context.urlPattern,
        target.tag,
        target.role,
        strategies.map((strategy) => strategy.kind + ':' + strategy.value).join('|')
      ]),
      target,
      strategies,
      context,
      capture: {
        capturedAt: Date.now(),
        url: index.snapshot.origin.url,
        title: index.snapshot.origin.title,
        scanLevel: index.snapshot.origin.scanLevel,
        modelVersion: index.snapshot.modelVersion,
        sourceVersion: index.snapshot.sourceVersion,
        inViewport: element.visibility.inViewport,
        occlusion: element.visibility.occlusion,
        editable: element.interactivity.editable
      },
      quality: qualityOf(strategies)
    }
  }

  private collect(element: ElementModel, index: ModelIndex): StrategyPayload[] {
    const out: StrategyPayload[] = []
    for (const strategy of STRATEGY_CHAIN) {
      const payload = strategy.extract(element, index)
      if (payload) out.push(payload)
    }
    return out
  }

  private targetOf(element: ElementModel): DescriptorTarget {
    return {
      tag: element.tag,
      role: element.attrs['role'] || element.accessibility?.role || '',
      type: element.attrs['type'] ?? '',
      name: normalizeText(labelOf(element), 64)
    }
  }

  private contextOf(element: ElementModel, index: ModelIndex): DescriptorContext {
    return {
      urlPattern: urlPattern(index.snapshot.origin.url),
      framePath: element.framePath.chain.slice(),
      frameDepth: element.framePath.depth,
      crossOrigin: element.framePath.crossOrigin,
      shadowHosts: element.shadowPath.hops.map((hop) => hop.hostTag),
      shadowDepth: element.shadowPath.depth,
      ancestorSignature: ancestorSignature(element, index),
      neighborSignature: neighborSignature(element, index),
      formSignature: formSignature(element, index),
      siblingIndex: index.indexInParent(element),
      typeOrdinal: index.typeOrdinal(element),
      rect: element.geometry.viewport ? { ...element.geometry.viewport } : null,
      viewport: index.viewportSize
    }
  }
}

export function scopeOf(descriptor: Descriptor): string {
  return digest([descriptor.context.urlPattern, descriptor.target.tag, descriptor.target.role])
}
