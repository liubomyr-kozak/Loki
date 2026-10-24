import { CircleDashed } from 'lucide-react'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { EffectiveIcon } from '../../lib/appIcon'
import type { AppRowDragHandle } from './types'
import { NoIconFallback } from './NoIconFallback'

export interface AppRowStatusProps {
  process?: string
  hasActiveStatus: boolean
  effIcon: EffectiveIcon
  dragHandle?: AppRowDragHandle
}

export function AppRowStatus({ process, hasActiveStatus, effIcon, dragHandle }: AppRowStatusProps) {
  const dragging = dragHandle?.dragging ?? false
  return hasActiveStatus ? (
    <span
      className={`dot ${process ?? 'unknown'} draggable ${dragging ? 'dragging' : ''}`}
      title="Drag to reorder"
      {...dragHandle?.attributes}
      {...dragHandle?.listeners}
    />
  ) : (
    <span
      className={`rowIconHandle ${dragging ? 'dragging' : ''}`}
      title="Drag to reorder"
      {...dragHandle?.attributes}
      {...dragHandle?.listeners}
    >
      {effIcon.kind === 'library'
        ? <DynamicIcon name={effIcon.name} size={14} strokeWidth={1} fallback={NoIconFallback} />
        : <CircleDashed size={12} strokeWidth={1} />}
    </span>
  )
}
