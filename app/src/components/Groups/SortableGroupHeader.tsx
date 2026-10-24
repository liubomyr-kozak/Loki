import { useSortable } from '@dnd-kit/sortable'
import { GroupHeader } from './GroupHeader'
import type { GroupHeaderProps } from './GroupHeader'

// @dnd-kit/utilities is not a dependency of this package (only @dnd-kit/core
// + @dnd-kit/sortable were added) — hand-write the CSS transform string
// instead of importing CSS.Translate.
type SortableGroupHeaderProps = Omit<GroupHeaderProps, 'dragHandle'> & {
  groupLabel: string
}

export function SortableGroupHeader({ groupLabel, ...rest }: SortableGroupHeaderProps) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: groupLabel })

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
  }

  return (
    <GroupHeader
      {...rest}
      dragHandle={{ attributes, listeners, setNodeRef, style }}
    />
  )
}
