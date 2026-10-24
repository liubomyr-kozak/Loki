import { Loader2 } from 'lucide-react'

export interface AppRowActionsProps {
  isBusy: boolean
  isStoppable: boolean
  port?: number
  onToggle: () => void
  restart?: boolean
}

export function AppRowActions({ isBusy, isStoppable, port, onToggle, restart }: AppRowActionsProps) {
  return (
    <button
      className={`toggle ${isStoppable ? 'on' : ''}`}
      disabled={isBusy}
      onClick={onToggle}
    >{isBusy
      ? <Loader2 size={14} className="spin" />
      : isStoppable
        ? (restart ? 'Restart' : (port != null ? <><span>Stop</span><span className="togglePort">:{port}</span></> : 'Stop'))
        : 'Start'}</button>
  )
}
