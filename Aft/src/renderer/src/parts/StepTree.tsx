import React, { memo, useState } from 'react'
import type { ScenarioStep } from '../../../main/scenario/types'
import { Glyph } from '../icons'
import { Pill } from '../ui'
import type { Tone } from '../ui'

const KIND_TONE: Record<string, Tone> = {
  assert: 'accent',
  group: 'flat'
}

export type FlatStep = { step: ScenarioStep; depth: number }

export default memo(function StepTree({
  steps,
  selected,
  disabled,
  onSelect,
  onMove
}: {
  steps: FlatStep[]
  selected: string
  disabled: boolean
  onSelect: (id: string) => void
  onMove: (dragId: string, targetId: string, after: boolean) => void
}): React.JSX.Element {
  const [dragId, setDragId] = useState('')
  const [mark, setMark] = useState({ id: '', after: false })

  const clear = (): void => {
    setDragId('')
    setMark({ id: '', after: false })
  }

  return (
    <div className="steps">
      {steps.map(({ step, depth }, index) => (
        <div
          key={step.id}
          className={
            'step-row' +
            (step.id === selected ? ' sel' : '') +
            (dragId === step.id ? ' dragging' : '') +
            (mark.id === step.id ? (mark.after ? ' drop-after' : ' drop-before') : '')
          }
          style={{ paddingLeft: 10 + depth * 14 }}
          role="button"
          tabIndex={0}
          draggable={!disabled}
          onClick={() => onSelect(step.id)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onSelect(step.id)
          }}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', step.id)
            setDragId(step.id)
            onSelect(step.id)
          }}
          onDragEnd={clear}
          onDragOver={(event) => {
            if (!dragId || dragId === step.id) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            const box = event.currentTarget.getBoundingClientRect()
            setMark({ id: step.id, after: event.clientY - box.top > box.height / 2 })
          }}
          onDragLeave={() => setMark({ id: '', after: false })}
          onDrop={(event) => {
            event.preventDefault()
            const id = dragId
            const after = mark.id === step.id ? mark.after : false
            clear()
            if (!id || id === step.id) return
            onMove(id, step.id, after)
          }}
        >
          <span className="step-grip" aria-hidden="true">
            <Glyph name="drag" size={12} />
          </span>
          <span className="step-no">{index + 1}</span>
          <span className="step-title">{step.title}</span>
          <Pill tone={KIND_TONE[step.kind] ?? 'flat'}>{step.kind}</Pill>
          {step.continueOnFailure ? <Glyph name="flag" size={12} /> : null}
        </div>
      ))}
    </div>
  )
})
