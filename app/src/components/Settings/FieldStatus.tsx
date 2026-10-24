import { Check, Loader2, X } from 'lucide-react'

export type FieldStatusValue = 'idle' | 'saving' | 'ok' | 'error'

export function FieldStatusIndicator({ status }: { status?: FieldStatusValue }) {
  if (!status || status === 'idle') return null
  if (status === 'saving') {
    return (
      <span className="fieldStatusIcon fieldStatusIcon--saving" title="Saving…">
        <Loader2 size={12} className="spin" />
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="fieldStatusIcon fieldStatusIcon--error" title="Save failed">
        <X size={12} />
      </span>
    )
  }
  return (
    <span className="fieldStatusIcon fieldStatusIcon--ok" title="Saved">
      <Check size={12} />
    </span>
  )
}
