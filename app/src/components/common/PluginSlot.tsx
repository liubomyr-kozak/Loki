import { useEffect, useRef, useState } from 'react'
import { useAppDispatch } from '../../store/hooks'
import { invokePlugin } from '../../store/slices/pluginsSlice'
import { ToggleSwitch } from '../pickers/ToggleSwitch'
import { ICON_MAP, FALLBACK_ICON } from '../../lib/pluginIcons'
import type { ControlDescriptor } from '../../api'

export interface PluginSlotProps {
  pluginId: string
  desc: ControlDescriptor
  appName: string
  busy?: boolean
  iconSize: number
  /** Set when this slot renders one item of a group descriptor — sent as `input.action` instead of `input:{}`. */
  actionId?: string
}

export function PluginSlot({ pluginId, desc, appName, busy, iconSize, actionId }: PluginSlotProps) {
  const dispatch = useAppDispatch()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  const disabled = !!desc.disabledHint || !!busy

  if (desc.action === 'toggle') {
    return (
      <ToggleSwitch
        label={desc.label}
        title={desc.title ?? desc.label}
        checked={!!desc.checked}
        disabled={disabled}
        unmanaged={!!desc.unmanaged}
        onChange={(checked) => dispatch(invokePlugin({ pluginId, appName, input: { checked } }))}
      />
    )
  }

  const Icon = ICON_MAP[desc.icon ?? ''] ?? FALLBACK_ICON
  const confirming = confirmingId === pluginId
  return (
    <button
      className={`pluginBtn${confirming ? ' confirming' : ''}`}
      disabled={disabled}
      title={desc.title ?? desc.label}
      onClick={() => {
        if (desc.confirm && !confirming) {
          setConfirmingId(pluginId)
          if (confirmTimer.current) clearTimeout(confirmTimer.current)
          confirmTimer.current = setTimeout(() => setConfirmingId((cur) => (cur === pluginId ? null : cur)), 3000)
          return
        }
        setConfirmingId(null)
        dispatch(invokePlugin({ pluginId, appName, input: actionId ? { action: actionId } : {} }))
      }}
    >
      <Icon size={iconSize} /><span>{confirming ? desc.confirm : desc.label}</span>
    </button>
  )
}
