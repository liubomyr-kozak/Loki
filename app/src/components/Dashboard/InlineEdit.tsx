import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'

export function InlineEdit({
  value,
  placeholder = '—',
  onSave,
  type = 'text',
  className,
  editAffordance,
}: {
  value: string
  placeholder?: string
  onSave: (next: string) => Promise<void> | void
  type?: 'text' | 'number'
  className?: string
  editAffordance?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // Latest `value` without making the entering-edit effect below re-fire on every
  // prop change while already editing (that would clobber in-progress user input).
  const valueRef = useRef(value)
  valueRef.current = value

  useEffect(() => {
    if (editing) {
      setDraft(valueRef.current)
      const el = inputRef.current
      if (el) {
        el.focus()
        requestAnimationFrame(() => {
          const len = el.value.length
          el.setSelectionRange(len, len)
        })
      }
    }
    // Intentionally only reacts to the editing on/off edge — `value` is read via
    // valueRef so entering edit mode always seeds the freshest value without
    // resetting the draft while the user is mid-edit.
  }, [editing])

  const commit = async () => {
    const trimmed = draft.trim()
    if (trimmed === value.trim()) {
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (!editing) {
    return (
      <span
        className={`inlineEditText${value ? '' : ' inlineEditText--placeholder'}${className ? ` ${className}` : ''}`}
        onClick={() => setEditing(true)}
        title={value || 'Click to edit'}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setEditing(true)
          }
        }}
      >
        {value || placeholder}
        {editAffordance && <Pencil size={13} className="inlineEditPencil" />}
      </span>
    )
  }

  return (
    <input
      ref={inputRef}
      className={`inlineEditInput${className ? ` ${className}` : ''}`}
      type={type}
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      autoComplete="off"
    />
  )
}
