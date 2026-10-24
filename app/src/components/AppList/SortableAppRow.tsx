import { useSortable } from '@dnd-kit/sortable'
import { AppRow } from './AppRow'
import type { AppRowProps } from './types'

// @dnd-kit/utilities is not a dependency of this package — hand-write the
// CSS transform string instead of importing CSS.Translate (same convention
// as SortableGroupHeader).
type SortableAppRowProps = Omit<AppRowProps, 'sortableRef' | 'sortableStyle' | 'dragHandle'>

export function SortableAppRow(props: SortableAppRowProps) {
  // id is a rowId (appName or instanceId) — this is what fixes the
  // two-rows-of-one-appName DnD collision from the ADR.
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.name })

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
  }

  return (
    <AppRow
      {...props}
      sortableRef={setNodeRef}
      sortableStyle={style}
      dragHandle={{ attributes, listeners, dragging: isDragging }}
    />
  )
}
