import { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from '../../store/hooks'
import { invokePlugin } from '../../store/slices/pluginsSlice'
import { usePopoverPosition } from '../../hooks/usePopoverPosition'
import { useOutsideClose } from '../../hooks/useOutsideClose'
import { Popover, popoverStyle } from '../portals/Popover'
import { MenuItem } from '../portals/MenuItem'
import { ICON_MAP, FALLBACK_ICON } from '../../lib/pluginIcons'
import type { ControlGroupDescriptor } from '../../api'

const CONFIRM_TIMEOUT_MS = 3000

export interface PluginGroupPopupProps {
  pluginId: string
  desc: ControlGroupDescriptor
  appName: string
  busy?: boolean
  iconSize: number
}

// Standalone popover for A7 mode 2 (surface:'list', mode:'popup'): one trigger
// button per row, click opens a list of the group's items. Deliberately local
// state, not wired into MenusContext — see PluginSlot/AppContextMenu for the
// group-buttons/group-menu siblings of this component.
export function PluginGroupPopup({ pluginId, desc, appName, busy, iconSize }: PluginGroupPopupProps) {
  const dispatch = useAppDispatch()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
    }
  }, [])

  const close = () => {
    setOpen(false)
    setAnchor(null)
    setConfirmingId(null)
  }

  const pos = usePopoverPosition(anchor, popRef, [open, desc.items.length], 'clamp')

  useOutsideClose(open, close, { selector: '.pluginGroupPopup', event: 'click' })

  // MenusContext's global Escape handler doesn't reach this popup (it isn't
  // registered there by design) — it needs its own, or Escape would silently
  // do nothing while the popup is open.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const disabled = !!busy
  const TriggerIcon = ICON_MAP[desc.icon ?? ''] ?? FALLBACK_ICON

  return (
    <>
      <button
        ref={triggerRef}
        className="pluginBtn"
        disabled={disabled}
        title={desc.label}
        onClick={(e) => {
          e.stopPropagation()
          if (open) { close(); return }
          const rect = triggerRef.current?.getBoundingClientRect()
          if (rect) setAnchor({ x: rect.left, y: rect.bottom })
          setOpen(true)
        }}
      >
        <TriggerIcon size={iconSize} /><span>{desc.label}</span>
      </button>
      {open && (
        <Popover
          innerRef={popRef}
          className="pluginGroupPopup"
          style={{
            ...popoverStyle,
            left: pos ? pos.left : (anchor?.x ?? -9999),
            top: pos ? pos.top : (anchor?.y ?? -9999),
          }}
        >
          {desc.items.filter((item) => item.visible).map((item) => {
            const itemKey = item.id ?? item.label
            const Icon = ICON_MAP[item.icon ?? ''] ?? FALLBACK_ICON
            const isConfirming = confirmingId === itemKey
            const itemDisabled = !!item.disabledHint || !!busy
            return (
              <MenuItem
                key={itemKey}
                danger={isConfirming}
                disabled={itemDisabled}
                icon={<Icon size={14} style={{ flexShrink: 0 }} />}
                label={isConfirming ? item.confirm : item.label}
                onSelect={() => {
                  if (item.confirm && !isConfirming) {
                    setConfirmingId(itemKey)
                    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
                    confirmTimerRef.current = setTimeout(
                      () => setConfirmingId((id) => (id === itemKey ? null : id)),
                      CONFIRM_TIMEOUT_MS,
                    )
                    return
                  }
                  setConfirmingId(null)
                  dispatch(invokePlugin({ pluginId, appName, input: item.id ? { action: item.id } : {} }))
                  close()
                }}
              />
            )
          })}
        </Popover>
      )}
    </>
  )
}
