import { PackageOpen } from 'lucide-react'
import { DndContext, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { selectListNames, selectEffectiveOrder } from '../../store/selectors'
import { setOrder } from '../../store/slices/orderSlice'
import { onWorkspaceOpened } from '../../usecases/menuNavigation'
import { api } from '../../api'
import { SortableAppRow } from './SortableAppRow'
import { GroupSection } from '../Groups/GroupSection'
import { AllSection } from '../Groups/AllSection'

export function AppList() {
  const dispatch = useAppDispatch()

  const visibleNames = useAppSelector(selectListNames)
  const configuredCount = useAppSelector((s) => Object.keys(s.apps.config?.apps ?? {}).length)
  const searchQuery = useAppSelector((s) => s.ui.searchQuery)
  const filterRunning = useAppSelector((s) => s.ui.filterRunning)
  const fullOrder = useAppSelector(selectEffectiveOrder)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleRowDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fullOrder.indexOf(String(active.id))
    const newIndex = fullOrder.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    const next = arrayMove(fullOrder, oldIndex, newIndex)
    dispatch(setOrder(next))
    api.setOrder(next).catch(() => {})
  }

  // Each rendered row list (one per group, plus AllSection's) gets its own
  // self-contained DndContext — reorder is scoped to that list, mirroring
  // GroupSection's own group-header drag. onDragEnd still splices against the
  // FULL effective order (not just this list's `names`) so apps outside this
  // list never get truncated out of the persisted order.
  const renderRows = (names: string[], groupId?: string) => (
    <DndContext sensors={sensors} onDragEnd={handleRowDragEnd}>
      <SortableContext items={names} strategy={verticalListSortingStrategy}>
        {names.map((name) => (
          <SortableAppRow key={name} name={name} groupId={groupId} />
        ))}
      </SortableContext>
    </DndContext>
  )

  return (
    <>
      {visibleNames.length === 0 && (
        searchQuery || filterRunning || configuredCount > 0
          ? (
            <div className="empty">
              {searchQuery
                ? 'No apps match your search.'
                : filterRunning
                  ? 'No apps are currently running.'
                  : 'No apps configured yet.'}
            </div>
            )
          : (
            <div className="emptyState">
              <PackageOpen size={28} className="emptyStateIcon" />
              <div className="emptyStateTitle">No apps yet</div>
              <div className="emptyStateHint">Apps are added in the Workspace — import a project there to get started.</div>
              <button className="scanConfirmBtn" onClick={() => void dispatch(onWorkspaceOpened('apps'))}>
                Open Workspace
              </button>
            </div>
            )
      )}
      {configuredCount > 0 && (
        <>
          <GroupSection renderRows={renderRows} />
          <AllSection renderRows={renderRows} />
        </>
      )}
    </>
  )
}
