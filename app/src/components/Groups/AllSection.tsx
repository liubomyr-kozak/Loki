import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { toggleCollapsedGroup } from '../../store/slices/uiSlice'
import { makeSectionRows, selectAllMemberNames, selectInstancesById } from '../../store/selectors'
import { ALL_ID } from '../../lib/constants'
import { GroupHeader } from './GroupHeader'
import type { GroupSectionSharedProps } from '../AppList/types'

export function AllSection({ renderRows }: GroupSectionSharedProps) {
  const dispatch = useAppDispatch()
  const apps = useAppSelector((s) => s.apps.apps)
  const config = useAppSelector((s) => s.apps.config)
  const collapsedGroups = useAppSelector((s) => s.ui.collapsedGroups)
  const searchQuery = useAppSelector((s) => s.ui.searchQuery)
  const filterRunning = useAppSelector((s) => s.ui.filterRunning)
  const allMembers = useAppSelector(selectAllMemberNames)
  const instancesById = useAppSelector(selectInstancesById)

  const sectionRows = makeSectionRows({ config, apps, searchQuery, filterRunning, instancesById })
  const allVisibleRows = sectionRows(allMembers)
  const collapsed = collapsedGroups.includes(ALL_ID)

  return (
    <div>
      <GroupHeader
        derived
        readOnly
        groupId={ALL_ID}
        name="All"
        members={allMembers}
        collapsed={collapsed}
        onToggleCollapse={() => dispatch(toggleCollapsedGroup(ALL_ID))}
      />
      {!collapsed && allVisibleRows.length > 0 && (
        <div className="groupCard">{renderRows(allVisibleRows)}</div>
      )}
    </div>
  )
}
