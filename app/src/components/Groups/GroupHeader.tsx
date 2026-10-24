import { ChevronRight, MoreVertical, Play, Square } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { startGroupExclusive, stopApps } from '../../store/groupOps'
import { refreshAll } from '../../store/slices/appsSlice'
import { fetchDescriptors } from '../../store/slices/pluginsSlice'
import { isRunning } from '../../lib/grouping'
import { useMenus } from '../MenusContext'

export interface GroupHeaderDragHandle {
  attributes: object
  listeners: object | undefined
  setNodeRef: (el: HTMLElement | null) => void
  style?: React.CSSProperties
}

export interface GroupHeaderProps {
  groupId: string
  name: string
  members: string[]
  collapsed: boolean
  onToggleCollapse: () => void
  derived?: boolean
  readOnly?: boolean
  dragHandle?: GroupHeaderDragHandle
}

export function GroupHeader({ groupId, name, members, collapsed, onToggleCollapse, derived = false, readOnly = false, dragHandle }: GroupHeaderProps) {
  const dispatch = useAppDispatch()
  const { groupMenu, openGroupMenu, closeGroupMenu } = useMenus()
  const apps = useAppSelector((s) => s.apps.apps)

  const isSectionExpanded = !collapsed
  const hasRunning = members.some((a) => apps[a]?.process === 'running')
  const hasNotRunning = members.some((a) => apps[a]?.process !== 'running')
  const runningInGroup = members.filter((a) => isRunning(apps[a])).length
  const totalInGroup = members.length
  const anyRunning = runningInGroup > 0
  const showRunning = !readOnly && anyRunning

  return (
    <div
      className="groupHeader"
      style={{ justifyContent: 'space-between', cursor: dragHandle ? 'grab' : undefined, ...dragHandle?.style }}
      onClick={onToggleCollapse}
      ref={dragHandle?.setNodeRef}
      {...dragHandle?.attributes}
      {...dragHandle?.listeners}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
        <ChevronRight size={11} style={{ flexShrink: 0, color: 'var(--text-secondary)', transform: isSectionExpanded ? 'rotate(90deg)' : undefined, transition: 'transform 0.15s' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
        <span className={`groupCountPill${showRunning ? ' running' : ''}`}>
          {showRunning && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--dot-running)', flexShrink: 0, display: 'inline-block' }} />}
          {showRunning ? `${runningInGroup}/${totalInGroup}` : totalInGroup}
        </span>
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {hasNotRunning && (
            <button className="groupActionPill start" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); dispatch(startGroupExclusive({ groupId, names: members })).then(() => { dispatch(refreshAll()); dispatch(fetchDescriptors()) }) }}><Play size={11} /><span>Start</span></button>
          )}
          {!hasNotRunning && hasRunning && (
            <button className="groupActionPill stop" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); dispatch(stopApps(members)).then(() => { dispatch(refreshAll()); dispatch(fetchDescriptors()) }) }}><Square size={11} /><span>Stop</span></button>
          )}
          <button
            className="groupBtn"
            title="Group actions"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (groupMenu?.groupId === groupId) {
                closeGroupMenu()
              } else {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                openGroupMenu(groupId, rect.left - 6, rect.top, { derived, members })
              }
            }}
          ><MoreVertical size={16} /></button>
        </div>
      )}
    </div>
  )
}
