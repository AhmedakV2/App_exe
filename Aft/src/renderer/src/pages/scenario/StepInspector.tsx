import React from 'react'
import type {
  Assertion,
  AssertionKind,
  Scenario,
  ScenarioStep,
  StepKind
} from '../../../../main/scenario/types'
import { ASSERTION_KINDS } from '../../../../main/scenario/types'
import { IconButton } from '../../icons'
import { Card, Empty, Field, Toggle } from '../../ui'
import { percent, shortUrl } from '../../format'
import TargetEditor from './TargetEditor'
import {
  ADD_KINDS,
  ELEMENT_ASSERTIONS,
  ELEMENT_KINDS,
  NUMERIC_KINDS,
  TARGETLESS_KINDS,
  blankTarget,
  intOf,
  patchValue,
  valueLabel,
  valueOf
} from './model'

export default function StepInspector({
  draft,
  step,
  locked,
  clip,
  place,
  onOpenDefaults,
  onMove,
  onCopy,
  onPaste,
  onRemove,
  onPatch,
  onPatchAssertion
}: {
  draft: Scenario | null
  step: ScenarioStep | null
  locked: boolean
  clip: ScenarioStep | null
  place: string
  onOpenDefaults: () => void
  onMove: (id: string, offset: number) => void
  onCopy: () => void
  onPaste: () => void
  onRemove: (id: string) => void
  onPatch: (id: string, change: Partial<ScenarioStep>) => void
  onPatchAssertion: (id: string, change: Partial<Assertion>) => void
}): React.JSX.Element {
  return (
    <Card
      label="Adım ayarı"
      actions={
        draft ? (
          <IconButton
            name="sliders"
            title="Senaryo varsayılanları"
            onClick={() => onOpenDefaults()}
            small
          />
        ) : null
      }
      scroll
    >
      {draft && step ? (
        <>
          <div className="step-actions">
            <IconButton
              name="up"
              title="Yukarı"
              onClick={() => onMove(step.id, -1)}
              disabled={locked}
              small
            />
            <IconButton
              name="down"
              title="Aşağı"
              onClick={() => onMove(step.id, 1)}
              disabled={locked}
              small
            />
            <IconButton
              name="copy"
              title="Adımı kopyala (Ctrl+C)"
              onClick={onCopy}
              disabled={locked}
              small
            />
            <IconButton
              name="layers"
              title="Adımı yapıştır (Ctrl+V)"
              onClick={onPaste}
              disabled={locked || !clip}
              small
            />
            <IconButton
              name="trash"
              title="Adımı sil (Del)"
              onClick={() => onRemove(step.id)}
              disabled={locked}
              small
              danger
            />
          </div>

          <div className="grid-2">
            <Field label="Tür">
              <select
                value={step.kind}
                disabled={locked}
                onChange={(event) => {
                  const next = event.target.value as StepKind
                  onPatch(step.id, {
                    kind: next,
                    waitMs: next === 'wait' && step.waitMs <= 0 ? 1000 : step.waitMs,
                    target: ELEMENT_KINDS.has(next)
                      ? (step.target ?? blankTarget('query'))
                      : TARGETLESS_KINDS.has(next)
                        ? null
                        : step.target,
                    assertion:
                      next === 'assert'
                        ? (step.assertion ?? {
                            kind: 'url-matches',
                            target: null,
                            expected: '',
                            attribute: '',
                            count: 0,
                            soft: false,
                            message: ''
                          })
                        : step.assertion
                  })
                }}
              >
                {ADD_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Başlık">
              <input
                value={step.title}
                onChange={(event) => onPatch(step.id, { title: event.target.value })}
                spellCheck={false}
              />
            </Field>
          </div>

          {valueLabel(step.kind) ? (
            <Field label={valueLabel(step.kind)}>
              <input
                type={NUMERIC_KINDS.has(step.kind) ? 'number' : 'text'}
                value={valueOf(step)}
                onChange={(event) => onPatch(step.id, patchValue(step.kind, event.target.value))}
                spellCheck={false}
              />
            </Field>
          ) : null}

          {step.target?.descriptor ? (
            <div className="kv">
              <span className="kv-key">Kalite</span>
              <span className="kv-val">{percent(step.target.descriptor.quality.score)}</span>
              <span className="kv-key">Strateji</span>
              <span className="kv-val">
                {step.target.descriptor.strategies.map((entry) => entry.kind).join(', ')}
              </span>
            </div>
          ) : null}

          {step.kind === 'assert' ? null : (
            <TargetEditor
              label="Hedef"
              target={step.target}
              disabled={locked}
              onChange={(next) => onPatch(step.id, { target: next })}
            />
          )}

          {step.assertion ? (
            <>
              <div className="card-split">Doğrulama</div>
              <Field label="Tür">
                <select
                  value={step.assertion.kind}
                  onChange={(event) =>
                    onPatchAssertion(step.id, { kind: event.target.value as AssertionKind })
                  }
                >
                  {ASSERTION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Beklenen">
                <input
                  value={step.assertion.expected}
                  onChange={(event) => onPatchAssertion(step.id, { expected: event.target.value })}
                  spellCheck={false}
                />
              </Field>
              {step.assertion.kind === 'attribute-equals' ? (
                <Field label="Nitelik">
                  <input
                    value={step.assertion.attribute}
                    onChange={(event) =>
                      onPatchAssertion(step.id, { attribute: event.target.value })
                    }
                    spellCheck={false}
                  />
                </Field>
              ) : null}
              {step.assertion.kind === 'element-count' ? (
                <Field label="Adet">
                  <input
                    type="number"
                    value={step.assertion.count}
                    onChange={(event) =>
                      onPatchAssertion(step.id, {
                        count: Math.max(0, intOf(event.target.value, 0))
                      })
                    }
                  />
                </Field>
              ) : null}
              <Toggle
                label="Yumuşak doğrulama"
                checked={step.assertion.soft}
                onChange={(next) => onPatchAssertion(step.id, { soft: next })}
              />
              {ELEMENT_ASSERTIONS.has(step.assertion.kind) ? (
                <TargetEditor
                  label="Doğrulama hedefi"
                  target={step.assertion.target}
                  disabled={locked}
                  onChange={(next) => onPatchAssertion(step.id, { target: next })}
                />
              ) : null}
            </>
          ) : null}

          <div className="card-split">Adım ayarları</div>

          <div className="grid-2">
            <Field label="Zaman aşımı">
              <input
                type="number"
                value={step.timeoutMs}
                onChange={(event) =>
                  onPatch(step.id, { timeoutMs: Math.max(0, intOf(event.target.value, 0)) })
                }
              />
            </Field>
            <Field label="Deneme">
              <input
                type="number"
                value={step.retries}
                onChange={(event) =>
                  onPatch(step.id, { retries: Math.max(0, intOf(event.target.value, 0)) })
                }
              />
            </Field>
          </div>

          <Toggle
            label="Hatada devam et"
            checked={step.continueOnFailure}
            onChange={(next) => onPatch(step.id, { continueOnFailure: next })}
          />
          <Toggle
            label="Düşük güvene izin ver"
            checked={step.allowLowConfidence}
            onChange={(next) => onPatch(step.id, { allowLowConfidence: next })}
          />

          <div className="kv">
            <span className="kv-key">Şema</span>
            <span className="kv-val mono">{draft.version}</span>
            <span className="kv-key">Kimlik</span>
            <span className="kv-val mono">{draft.id}</span>
            <span className="kv-key">Adres</span>
            <span className="kv-val mono">{shortUrl(draft.baseUrl)}</span>
            <span className="kv-key">Konum</span>
            <span className="kv-val mono">{place || 'Kök'}</span>
          </div>
        </>
      ) : (
        <Empty
          glyph="sliders"
          text="Adım seçilmedi"
          hint="Ortadaki listeden bir adım seçtiğinizde ayarları burada açılır."
        />
      )}
    </Card>
  )
}
