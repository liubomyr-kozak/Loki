import ReactDOM from 'react-dom'
import { AlertTriangle } from 'lucide-react'

export interface GitCheckoutConfirmProps {
  variant: 'confirm' | 'conflict'
  title: string
  warnings?: string[]
  files?: string[]
  message?: string
  onConfirm?: () => void
  onCancel: () => void
  confirmLabel?: string
  // The confirm slot is red-filled by default (`.modalBtn.danger` resolves to
  // --toggle-on, the destructive red). Gates whose confirm action is the SAFE
  // one — settings import confirms Merge, not Replace — opt into the
  // affirmative fill instead, so colour and meaning agree.
  confirmTone?: 'danger' | 'primary'
  // Optional third choice alongside Confirm/Cancel — e.g. the group-drift
  // gate's "Keep as-is". Only rendered for the 'confirm' variant.
  secondaryLabel?: string
  onSecondary?: () => void
  // Marks the secondary choice as the destructive one, for gates where the
  // safe option belongs in the filled confirm slot (settings import: Merge
  // confirms, Replace wipes). Defaults to the plain look every other caller
  // already gets.
  secondaryTone?: 'default' | 'destructive'
}

const DEFAULT_CONFLICT_MESSAGE = 'Unresolved conflict — resolve it in the repository before switching branches again.'

export function GitCheckoutConfirm({ variant, title, warnings, files, message, onConfirm, onCancel, confirmLabel, secondaryLabel, onSecondary, confirmTone = 'danger', secondaryTone = 'default' }: GitCheckoutConfirmProps) {
  return ReactDOM.createPortal(
    <div className="modalOverlay" onClick={onCancel}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">{title}</div>

        {variant === 'confirm' && warnings?.map((w, i) => (
          <div key={i} className="modalRow">{w}</div>
        ))}

        {variant === 'conflict' && (
          <div className="modalRow modalDanger" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} />
              {message ?? DEFAULT_CONFLICT_MESSAGE}
            </span>
            {!!files?.length && (
              <code style={{ whiteSpace: 'pre-wrap' }}>{files.join('\n')}</code>
            )}
          </div>
        )}

        <div className="modalActions">
          {variant === 'confirm'
            ? (
              <>
                <button className="modalBtn" onClick={onCancel}>Cancel</button>
                {secondaryLabel && (
                  <button
                    className={`modalBtn${secondaryTone === 'destructive' ? ' destructive' : ''}`}
                    onClick={onSecondary}
                  >
                    {secondaryLabel}
                  </button>
                )}
                <button className={`modalBtn ${confirmTone}`} onClick={onConfirm}>{confirmLabel ?? 'Confirm'}</button>
              </>
              )
            : <button className="modalBtn" onClick={onCancel}>OK</button>}
        </div>
      </div>
    </div>,
    document.body,
  )
}
