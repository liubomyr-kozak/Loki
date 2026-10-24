import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { toggleCollapsedGroup } from '../../store/slices/uiSlice'
import { makeSectionRows, selectListNameSet, selectSortedAll, selectInstancesById, selectInstancesByApp } from '../../store/selectors'
import { expandRows } from '../../lib/grouping'
import { OTHER_ID } from '../../lib/constants'
import { GroupHeader } from './GroupHeader'
import type { GroupSectionSharedProps } from '../AppList/types'

export function OtherSection({ renderRows }: GroupSectionSharedProps) {
  const dispatch = useAppDispatch()
  const sortedAll = useAppSelector(selectSortedAll)
  const apps = useAppSelector((s) => s.apps.apps)
  const config = useAppSelector((s) => s.apps.config)
  const collapsedGroups = useAppSelector((s) => s.ui.collapsedGroups)
  const searchQuery = useAppSelector((s) => s.ui.searchQuery)
  const filterRunning = useAppSelector((s) => s.ui.filterRunning)
  const listNames = useAppSelector(selectListNameSet)
  const instancesById = useAppSelector(selectInstancesById)
  const instancesByApp = useAppSelector(selectInstancesByApp)

  const sectionRows = makeSectionRows({ config, apps, searchQuery, filterRunning, instancesById })
  // Header keeps pure appNames; rows get clone instances woven in.
  const otherMembers = sortedAll.filter((n) => listNames.has(n))
  const otherVisibleRows = sectionRows(expandRows(otherMembers, instancesByApp))
  const collapsed = collapsedGroups.includes(OTHER_ID)

  return (
    <div>
      <GroupHeader
        derived
        readOnly
        groupId={OTHER_ID}
        name="Other"
        members={otherMembers}
        collapsed={collapsed}
        onToggleCollapse={() => dispatch(toggleCollapsedGroup(OTHER_ID))}
      />
      {!collapsed && otherVisibleRows.length > 0 && (
        <div className="groupCard">{renderRows(otherVisibleRows)}</div>
      )}
    </div>
  )
}
