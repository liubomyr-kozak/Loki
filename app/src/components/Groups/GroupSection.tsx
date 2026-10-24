import { useRef } from 'react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { toggleCollapsedGroup, setCollapsedGroups } from '../../store/slices/uiSlice'
import { setGroupOrder } from '../../store/slices/appsSlice'
import { selectListNameSet, selectGroupSections, selectInstancesByApp } from '../../store/selectors'
import { expandRows } from '../../lib/grouping'
import { SortableGroupHeader } from './SortableGroupHeader'
import { api } from '../../api'
import type { GroupSectionSharedProps } from '../AppList/types'

export function GroupSection({ renderRows }: GroupSectionSharedProps) {
  const dispatch = useAppDispatch()
  const groupSections = useAppSelector(selectGroupSections)
  const listNames = useAppSelector(selectListNameSet)
  const instancesByApp = useAppSelector(selectInstancesByApp)
  const collapsedGroups = useAppSelector((s) => s.ui.collapsedGroups)
  const fullGroupOrder = useAppSelector((s) => s.apps.config?.groupOrder ?? [])
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))
  // Snapshot of collapsedGroups taken at drag-start, restored at drag-end/cancel.
  const preDragCollapsed = useRef<string[] | null>(null)

  const visibleSections = groupSections
    .map(([label, names]) => [label, names.filter((n) => listNames.has(n))] as [string, string[]])
    .filter(([, names]) => names.length > 0)
  const visibleLabels = visibleSections.map(([label]) => label)

  const handleDragStart = (_event: DragStartEvent) => {
    preDragCollapsed.current = collapsedGroups
    // Union, not replace — collapsedGroups also holds ALL_ID (and anything
    // else outside this section's own labels). Replacing the whole array
    // with just visibleLabels would drop All's collapsed state, making it
    // flash open for the duration of the drag.
    dispatch(setCollapsedGroups([...new Set([...collapsedGroups, ...visibleLabels])]))
  }

  const restoreCollapsed = () => {
    if (preDragCollapsed.current !== null) {
      dispatch(setCollapsedGroups(preDragCollapsed.current))
      preDragCollapsed.current = null
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = fullGroupOrder.indexOf(String(active.id))
      const newIndex = fullGroupOrder.indexOf(String(over.id))
      if (oldIndex !== -1 && newIndex !== -1) {
        const next = arrayMove(fullGroupOrder, oldIndex, newIndex)
        dispatch(setGroupOrder(next))
        api.setGroupOrder(next).catch(() => {})
      }
    }
    restoreCollapsed()
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={restoreCollapsed}>
      <SortableContext items={visibleLabels} strategy={verticalListSortingStrategy}>
        {visibleSections.map(([label, names]) => {
          const collapsed = collapsedGroups.includes(label)
          return (
            <div key={label}>
              <SortableGroupHeader
                groupLabel={label}
                derived
                groupId={label}
                name={label}
                members={names}
                collapsed={collapsed}
                onToggleCollapse={() => dispatch(toggleCollapsedGroup(label))}
              />
              {!collapsed && (
                // Rows are expanded with clone instances only here, at render —
                // the header above keeps pure appNames, so group start/stop and
                // member counts never see instanceIds.
                <div className="groupCard">{renderRows(expandRows(names, instancesByApp), label)}</div>
              )}
            </div>
          )
        })}
      </SortableContext>
    </DndContext>
  )
}
