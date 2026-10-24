import { useRef, useState } from 'react'
import { Play, Square, Pencil, Trash2 } from 'lucide-react'
import { useMenus } from '../MenusContext'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import { store } from '../../store'
import { startGroupExclusive, stopApps } from '../../store/groupOps'
import { reloadConfig, setCfgMsg, setGroupOrder } from '../../store/slices/appsSlice'
import { fetchGroupSelections, renameGroupSelections } from '../../store/slices/groupSelectionsSlice'
import { api } from '../../api'
import { ALL_ID } from '../../lib/constants'
import { usePopoverPosition } from '../../hooks/usePopoverPosition'
import { useOutsideClose } from '../../hooks/useOutsideClose'
import { Popover, popoverStyle } from './Popover'
import { MenuItem } from './MenuItem'
import { MenuDivider } from './MenuDivider'
import { InlineTextForm } from './InlineTextForm'

export function GroupMenu() {
  const { groupMenu, closeGroupMenu } = useMenus()
  const dispatch = useAppDispatch()
  const config = useAppSelector((state) => state.apps.config)
  const apps = useAppSelector((state) => state.apps.apps)

  const [gmRenaming, setGmRenaming] = useState(false)
  const gmRef = useRef<HTMLDivElement>(null)

  const pos = usePopoverPosition(groupMenu, gmRef, [groupMenu, gmRenaming], 'anchorLeft')

  const reset = () => {
    setGmRenaming(false)
  }

  const closeAndReset = () => {
    closeGroupMenu()
    reset()
  }

  useOutsideClose(groupMenu !== null, closeAndReset, { selector: '.groupMenuPortal', event: 'mousedown' })

  if (groupMenu === null) return null

  const derivedMembers = groupMenu.members
    ?? Object.keys(config?.apps ?? {}).filter((n) => (config?.apps[n]?.groups ?? []).includes(groupMenu.groupId))

  const applyToDerivedMembers = async (
    buildNextGroups: (currentGroups: string[]) => string[],
    failureVerb: string,
  ): Promise<string[]> => {
    if (!config) return []
    const targets = derivedMembers.filter((name) => (config.apps[name]?.groups ?? []).includes(groupMenu.groupId))
    const results = await Promise.allSettled(
      targets.map((name) => api.patchApp(name, { groups: buildNextGroups(config.apps[name]?.groups ?? []) })),
    )
    const failed = targets.filter((_, i) => results[i].status === 'rejected')
    await dispatch(reloadConfig())
    if (failed.length > 0) {
      dispatch(
        setCfgMsg(
          `Group ${failureVerb} partially failed for: ${failed.join(', ')}. Configuration reloaded from disk — please check and retry.`,
        ),
      )
    }
    return failed
  }

  const renameDerivedGroup = async (newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === groupMenu.groupId) return
    if (trimmed === ALL_ID) {
      dispatch(setCfgMsg(`"${ALL_ID}" is reserved and can't be used as a group name.`))
      return
    }
    const oldLabel = groupMenu.groupId
    // Capture the group's position BEFORE applyToDerivedMembers runs — it
    // internally awaits a config reload that reconciles groupOrder (task-4),
    // pruning oldLabel and unshifting the new label to index 0. There is no
    // "same index" left to read once that has happened.
    const priorIndex = (store.getState().apps.config?.groupOrder ?? []).indexOf(oldLabel)
    const failed = await applyToDerivedMembers(
      (currentGroups) => currentGroups.map((tag) => (tag === oldLabel ? trimmed : tag)),
      'rename',
    )
    if (failed.length > 0) {
      dispatch(
        setCfgMsg(
          `Group renamed only partially — the tag rewrite failed for: ${failed.join(', ')}. Their branch/environment settings were left under the old group name "${oldLabel}".`,
        ),
      )
      return
    }
    // Success: every member was retagged, and reconciliation (task-4) has
    // already run as part of the reload above, unshifting `trimmed` to index
    // 0. Move it back to where `oldLabel` used to live so a rename doesn't
    // visually teleport the group to the front of the sidebar.
    if (priorIndex >= 0) {
      const order = store.getState().apps.config?.groupOrder ?? []
      const withoutNew = order.filter((label) => label !== trimmed)
      const insertAt = Math.min(priorIndex, order.length - 1)
      const next = [...withoutNew.slice(0, insertAt), trimmed, ...withoutNew.slice(insertAt)]
      dispatch(setGroupOrder(next))
      api.setGroupOrder(next).catch(() => {})
    }
    dispatch(renameGroupSelections({ from: oldLabel, to: trimmed }))
  }

  const deleteDerivedGroup = async () => {
    await applyToDerivedMembers(
      (currentGroups) => currentGroups.filter((tag) => tag !== groupMenu.groupId),
      'delete',
    )
    dispatch(fetchGroupSelections())
  }

  return (
    <Popover
      innerRef={gmRef}
      className="groupMenuPortal"
      style={{
        ...popoverStyle,
        left: pos ? pos.left : groupMenu.x,
        top: pos ? pos.top : groupMenu.y,
      }}
    >
      {(() => {
        const hasRunning = derivedMembers.some((a) => apps[a]?.process === 'running')
        const hasNotRunning = derivedMembers.some((a) => apps[a]?.process !== 'running')
        if (gmRenaming) {
          return (
            <InlineTextForm
              initialValue={groupMenu.groupId}
              placeholder="New name…"
              submitLabel="Save"
              onSubmit={(v) => {
                void renameDerivedGroup(v)
                closeGroupMenu()
                reset()
              }}
              onCancel={() => setGmRenaming(false)}
            />
          )
        }
        return (
          <>
            {hasNotRunning && (
              <MenuItem
                truncate={false}
                icon={<Play size={13} style={{ flexShrink: 0 }} />}
                label="Start group"
                onSelect={() => {
                  dispatch(startGroupExclusive({ groupId: groupMenu.groupId, names: derivedMembers }))
                  closeGroupMenu()
                }}
              />
            )}
            {hasRunning && (
              <MenuItem
                truncate={false}
                icon={<Square size={13} style={{ flexShrink: 0 }} />}
                label="Stop group"
                onSelect={() => {
                  dispatch(stopApps(derivedMembers))
                  closeGroupMenu()
                }}
              />
            )}
            <MenuDivider />
            <MenuItem
              truncate={false}
              icon={<Pencil size={13} style={{ flexShrink: 0 }} />}
              label="Rename"
              onSelect={() => setGmRenaming(true)}
            />
            <MenuItem
              danger
              truncate={false}
              icon={<Trash2 size={13} style={{ flexShrink: 0 }} />}
              label="Delete group"
              onSelect={() => {
                void deleteDerivedGroup()
                closeGroupMenu()
              }}
            />
          </>
        )
      })()}
    </Popover>
  )
}
