import { useState } from 'react'

export interface InlineTextFormProps {
  initialValue: string
  placeholder: string
  submitLabel: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export function InlineTextForm({ initialValue, placeholder, submitLabel, onSubmit, onCancel }: InlineTextFormProps) {
  const [value, setValue] = useState(initialValue)
  const submit = () => { if (value.trim()) onSubmit(value.trim()) }
  return (
    <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter' && value.trim()) submit()
          if (e.key === 'Escape') onCancel()
        }}
        placeholder={placeholder}
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
        style={{
          width: '100%',
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--popover-border)',
          borderRadius: '4px',
          color: 'var(--text-primary)',
          fontSize: '0.82rem',
          padding: '4px 8px',
          outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={(e) => { e.stopPropagation(); submit() }}
          style={{
            flex: 1,
            background: 'var(--toggle-off)',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '0.82rem',
            padding: '4px 8px',
            cursor: 'pointer',
          }}
        >{submitLabel}</button>
        <button
          onClick={(e) => { e.stopPropagation(); onCancel() }}
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid var(--popover-border)',
            borderRadius: '4px',
            color: 'var(--text-secondary)',
            fontSize: '0.82rem',
            padding: '4px 8px',
            cursor: 'pointer',
          }}
        >Cancel</button>
      </div>
    </div>
  )
}
