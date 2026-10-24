import { useEffect, useRef, useState } from 'react'
import { Check, ChevronRight, Copy, Plus, Settings as SettingsIcon, SquareTerminal, Star, Trash2 } from 'lucide-react'
import { useMenus } from '../MenusContext'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import { reloadConfig, setCfgMsg } from '../../store/slices/appsSlice'
import { toggleFavorite } from '../../store/slices/favoritesSlice'
import { cloneApp, deleteInstance } from '../../store/slices/instancesSlice'
import { api } from '../../api'
import { selectAllGroups } from '../../lib/grouping'
import { errMsg } from '../../lib/errors'
import { ALL_ID } from '../../lib/constants'
import { usePopoverPosition } from '../../hooks/usePopoverPosition'
import { useOutsideClose } from '../../hooks/useOutsideClose'
import { invokePlugin } from '../../store/slices/pluginsSlice'
import { onWorkspaceOpened } from '../../usecases/menuNavigation'
import { openTerminal } from '../AppList/TerminalButton'
import { ICON_MAP, FALLBACK_ICON } from '../../lib/pluginIcons'
import { Popover, popoverStyle } from './Popover'
import { MenuItem } from './MenuItem'
import { InlineTextForm } from './InlineTextForm'
import type { MarketplacePlugin, ControlDescriptor } from '../../api'

interface PluginMenuItem {
  plugin: MarketplacePlugin
  desc: ControlDescriptor
}

const CONFIRM_TIMEOUT_MS = 3000

// Wider than the shared popover default: this menu is a panel (group list with
// trailing badges/actions), not a plain list of labels.
const MENU_WIDTH = 268

export function AppContextMenu() {
  const { contextMenu, closeContextMenu } = useMenus()
  const dispatch = useAppDispatch()
  const config = useAppSelector((state) => state.apps.config)
  const plugins = useAppSelector((state) => state.plugins.list)
  const descriptors = useAppSelector((state) => state.plugins.descriptors)
  const runningActions = useAppSelector((state) => state.plugins.runningActions)

  const appName = contextMenu?.appName ?? ''
  const instanceId = contextMenu?.instanceId
  const isClone = !!instanceId

  const isBusy = useAppSelector((state) => !!state.apps.busy[appName])
  const isFavorite = useAppSelector((state) => state.favorites.favorites.includes(appName))

  const [cmShowInput, setCmShowInput] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const cmRef = useRef<HTMLDivElement>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pos = usePopoverPosition(contextMenu, cmRef, [contextMenu, cmShowInput], 'clamp')

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  const reset = () => {
    setCmShowInput(false)
    setConfirmingId(null)
  }

  const closeAndReset = () => {
    closeContextMenu()
    reset()
  }

  useOutsideClose(contextMenu !== null, closeAndReset, { selector: '.contextMenuPortal', event: 'mousedown' })

  if (contextMenu === null) return null

  const appGroups = config?.apps[appName]?.groups ?? []
  // Membership first (as in the mockup), then every other group as an add
  // target. ALL_ID is a derived bucket, never a real membership.
  const groupRows = [
    ...appGroups.filter((g) => g !== ALL_ID),
    ...selectAllGroups(config).filter((g) => g !== ALL_ID && !appGroups.includes(g)),
  ]

  const applyGroups = async (next: string[]) => {
    try {
      await api.patchApp(appName, { groups: next })
      await dispatch(reloadConfig())
    } catch (e) {
      await dispatch(reloadConfig())
      dispatch(setCfgMsg(`Group update failed: ${errMsg(e)}`))
    }
  }

  const toggleGroup = (g: string) => {
    if (appGroups.includes(g)) void applyGroups(appGroups.filter((x) => x !== g))
    else void applyGroups([...appGroups, g])
  }

  const pluginItems: PluginMenuItem[] = plugins.flatMap((plugin): PluginMenuItem[] => {
    const desc = descriptors[appName]?.[plugin.id]
    if (!desc || !desc.visible || desc.surface !== 'menu') return []
    if ('kind' in desc) {
      return desc.items.filter((item) => item.visible).map((item) => ({ plugin, desc: item }))
    }
    return [{ plugin, desc }]
  })

  return (
    <Popover
      innerRef={cmRef}
      className="contextMenuPortal organizeMenu"
      style={{
        ...popoverStyle,
        width: MENU_WIDTH,
        maxWidth: MENU_WIDTH,
        padding: 0,
        left: pos ? pos.left : contextMenu.x,
        top: pos ? pos.top : contextMenu.y,
      }}
    >
      <div className="organizeBody">
        <div className="organizeSectionLabel">Groups</div>
        {groupRows.length > 0 && (
          <div className="organizeCard">
            {groupRows.map((g) => {
              const member = appGroups.includes(g)
              return (
                <button
                  key={g}
                  type="button"
                  className={`organizeGroupRow${member ? ' member' : ''}`}
                  onClick={(e) => { e.stopPropagation(); toggleGroup(g) }}
                >
                  <span className={`organizeMark${member ? ' checked' : ''}`}>
                    {member && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="organizeGroupName">{g}</span>
                  {contextMenu.groupId === g && <span className="organizeBadge">Current</span>}
                  <span className={`organizeRowAction${member ? ' danger' : ''}`}>
                    {member ? <Trash2 size={13} /> : <Plus size={13} />}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {cmShowInput ? (
          <InlineTextForm
            initialValue=""
            placeholder="Group name…"
            submitLabel="Create"
            onSubmit={(v) => {
              const name = v.trim()
              if (name === ALL_ID) {
                dispatch(setCfgMsg(`"${ALL_ID}" is reserved and can't be used as a group name.`))
                closeAndReset()
                return
              }
              if (name && !appGroups.includes(name)) void applyGroups([...appGroups, name])
              closeAndReset()
            }}
            onCancel={() => setCmShowInput(false)}
          />
        ) : (
          <button
            type="button"
            className="organizeNewGroup"
            onClick={(e) => { e.stopPropagation(); setCmShowInput(true) }}
          >
            <Plus size={13} />
            <span>New group</span>
          </button>
        )}

        <div className="organizeSectionLabel spaced">General</div>

        <label className="organizeRow" onClick={(e) => e.stopPropagation()}>
          <Star
            size={14}
            className="organizeRowIcon"
            style={{ color: 'var(--star-active)' }}
            fill={isFavorite ? 'currentColor' : 'none'}
          />
          <span className="organizeRowLabel">Favorite</span>
          <span className="switch">
            <input
              type="checkbox"
              checked={isFavorite}
              onChange={() => dispatch(toggleFavorite({ name: appName }))}
            />
            <span className="slider" />
          </span>
        </label>

        <button
          type="button"
          className="organizeRow asButton"
          onClick={(e) => {
            e.stopPropagation()
            void openTerminal(appName)
            closeAndReset()
          }}
        >
          <SquareTerminal size={14} className="organizeRowIcon" />
          <span className="organizeRowLabel">Open in terminal</span>
        </button>

        <button
          type="button"
          className="organizeRow asButton"
          onClick={(e) => {
            e.stopPropagation()
            // Cloning always targets the ORIGINAL appName (already resolved
            // above), producing a sibling instance — never a clone-of-a-clone,
            // even when this button is opened from a clone's own menu.
            dispatch(cloneApp({ appName }))
            closeAndReset()
          }}
        >
          <Copy size={14} className="organizeRowIcon" />
          <span className="organizeRowLabel">Clone</span>
        </button>

        {isClone && (
          <MenuItem
            danger={confirmingId === 'delete-clone'}
            icon={<Trash2 size={14} />}
            label={confirmingId === 'delete-clone' ? 'Really delete?' : 'Delete clone'}
            onSelect={() => {
              if (confirmingId !== 'delete-clone') {
                setConfirmingId('delete-clone')
                if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                confirmTimerRef.current = setTimeout(
                  () => setConfirmingId((id) => (id === 'delete-clone' ? null : id)),
                  CONFIRM_TIMEOUT_MS,
                )
                return
              }
              setConfirmingId(null)
              dispatch(deleteInstance({ id: instanceId! }))
              closeAndReset()
            }}
          />
        )}

        {pluginItems.length > 0 && (
          <>
            <div className="organizeSectionLabel spaced">Actions</div>
            {pluginItems.map(({ plugin, desc }) => {
              const itemKey = desc.id ? `${plugin.id}:${desc.id}` : plugin.id
              const Icon = ICON_MAP[desc.icon ?? ''] ?? FALLBACK_ICON
              const isConfirming = confirmingId === itemKey
              const busy = isBusy || !!runningActions[`${plugin.id}:${appName}`]
              const disabled = !!desc.disabledHint || busy
              return (
                <MenuItem
                  key={itemKey}
                  danger={isConfirming}
                  disabled={disabled}
                  icon={<Icon size={14} style={{ flexShrink: 0 }} />}
                  label={isConfirming ? desc.confirm : desc.label}
                  onSelect={() => {
                    if (desc.confirm && !isConfirming) {
                      setConfirmingId(itemKey)
                      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                      confirmTimerRef.current = setTimeout(
                        () => setConfirmingId((id) => (id === itemKey ? null : id)),
                        CONFIRM_TIMEOUT_MS,
                      )
                      return
                    }
                    setConfirmingId(null)
                    dispatch(invokePlugin({ pluginId: plugin.id, appName, input: desc.id ? { action: desc.id } : {} }))
                    closeAndReset()
                  }}
                />
              )
            })}
          </>
        )}

        {/* Always the last row of the menu, set off with breathing room. */}
        <button
          type="button"
          className="organizeRow asButton appSettingsRow"
          onClick={(e) => {
            e.stopPropagation()
            void dispatch(onWorkspaceOpened('apps', appName))
            closeAndReset()
          }}
        >
          <SettingsIcon size={14} className="organizeRowIcon" />
          <span className="organizeRowLabel">App settings</span>
          <ChevronRight size={14} className="organizeRowChevron" />
        </button>
      </div>
    </Popover>
  )
}
