import React from 'react'
import type { QueryKind, StepTarget, TargetKind } from '../../../../main/scenario/types'
import { QUERY_KINDS } from '../../../../main/scenario/types'
import { Field } from '../../ui'
import { TARGET_KINDS, blankTarget } from './model'

export default function TargetEditor({
  label,
  target,
  disabled,
  onChange
}: {
  label: string
  target: StepTarget | null
  disabled: boolean
  onChange: (next: StepTarget | null) => void
}): React.JSX.Element {
  const kind = target?.kind ?? 'none'

  return (
    <>
      <div className="card-split">{label}</div>

      <Field label="Hedefleme">
        <select
          value={kind}
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value
            if (next === 'none') {
              onChange(null)
              return
            }
            onChange({ ...blankTarget(next as TargetKind), label: target?.label ?? '' })
          }}
        >
          <option value="none">Hedef yok</option>
          {TARGET_KINDS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </Field>

      {target ? (
        <Field label="Etiket">
          <input
            value={target.label}
            disabled={disabled}
            onChange={(event) => onChange({ ...target, label: event.target.value })}
            spellCheck={false}
          />
        </Field>
      ) : null}

      {target && (target.kind === 'descriptor' || target.kind === 'inline-descriptor') ? (
        <Field label="Descriptor kimliği">
          <input
            value={target.descriptorId}
            disabled={disabled}
            onChange={(event) => onChange({ ...target, descriptorId: event.target.value })}
            spellCheck={false}
          />
        </Field>
      ) : null}

      {target && target.kind === 'ordinal' ? (
        <Field label="Sıra">
          <input
            type="number"
            value={target.ordinal}
            disabled={disabled}
            onChange={(event) => onChange({ ...target, ordinal: Number(event.target.value) || 0 })}
          />
        </Field>
      ) : null}

      {target && target.kind === 'query' && target.query ? (
        <>
          <div className="grid-2">
            <Field label="Sorgu türü">
              <select
                value={target.query.kind}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...target,
                    query: { ...target.query!, kind: event.target.value as QueryKind }
                  })
                }
              >
                {QUERY_KINDS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Kaçıncı (-1 hepsi)">
              <input
                type="number"
                value={target.query.nth}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...target,
                    query: { ...target.query!, nth: Number(event.target.value) }
                  })
                }
              />
            </Field>
          </div>

          <Field label="Değer">
            <input
              value={target.query.value}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...target, query: { ...target.query!, value: event.target.value } })
              }
              spellCheck={false}
            />
          </Field>

          <div className="grid-2">
            <Field label="Etiket adı">
              <input
                value={target.query.tag}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...target, query: { ...target.query!, tag: event.target.value } })
                }
                spellCheck={false}
              />
            </Field>
            <Field label="Rol">
              <input
                value={target.query.role}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...target, query: { ...target.query!, role: event.target.value } })
                }
                spellCheck={false}
              />
            </Field>
          </div>

          {target.query.kind === 'test-id' ? (
            <Field label="Nitelik adı">
              <input
                value={target.query.attribute}
                disabled={disabled}
                onChange={(event) =>
                  onChange({
                    ...target,
                    query: { ...target.query!, attribute: event.target.value }
                  })
                }
                spellCheck={false}
              />
            </Field>
          ) : null}
        </>
      ) : null}
    </>
  )
}
