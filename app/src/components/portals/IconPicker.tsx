import { useEffect, useRef, useState } from 'react'
import { DynamicIcon, iconNames } from 'lucide-react/dynamic'
import { X } from 'lucide-react'
import { useMenus } from '../MenusContext'
import { useAppSelector, useAppDispatch } from '../../store/hooks'
import { reloadConfig } from '../../store/slices/appsSlice'
import { usePopoverPosition } from '../../hooks/usePopoverPosition'
import { useOutsideClose } from '../../hooks/useOutsideClose'
import { Popover, popoverStyle } from './Popover'
import { IconFallback } from './IconFallback'
import { api } from '../../api'

const RESULT_CAP = 60

export function IconPicker() {
  const { iconPicker, closeIconPicker } = useMenus()
  const dispatch = useAppDispatch()
  const cfg = useAppSelector((s) => (iconPicker ? s.apps.config?.apps[iconPicker.appName] : undefined))

  const [query, setQuery] = useState('')

  // This component stays mounted for the app's whole lifetime (App.tsx renders it
  // unconditionally; it returns null when closed rather than unmounting), so useState
  // initialisers run ONCE — they cannot seed per-app state. Without this sync, `query`
  // from one app's session would leak into the next app's. Syncing on open (rather than
  // resetting in `close()`, the GroupMenu/AppContextMenu convention) is deliberate:
  // Escape closes via MenusContext's `closeIconPicker` directly, bypassing `close()`
  // entirely, so a reset-on-close would silently miss that path.
  const openedFor = iconPicker?.appName
  useEffect(() => {
    if (!openedFor) return
    setQuery('')
    // cfg is intentionally not a dep: re-seed only when the picker opens for an app,
    // not on every config reload (that would clobber what the user is typing).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openedFor])

  const ipRef = useRef<HTMLDivElement>(null)
  const pos = usePopoverPosition(iconPicker, ipRef, [iconPicker], 'clamp')

  const close = () => {
    closeIconPicker()
    setQuery('')
  }

  useOutsideClose(iconPicker !== null, close, { selector: '.iconPickerPortal', event: 'mousedown' })

  if (iconPicker === null) return null

  const appName = iconPicker.appName

  const commit = async (icon: string | null) => {
    await api.patchApp(appName, { icon })
    await dispatch(reloadConfig())
    close()
  }

  const filtered = query
    ? iconNames.filter((n) => n.includes(query.toLowerCase()))
    : iconNames
  const results = filtered.slice(0, RESULT_CAP)
  const selectedIcon = iconNames.find((name) => name === cfg?.icon)

  return (
    <Popover
      innerRef={ipRef}
      className="iconPickerPortal"
      style={{
        ...popoverStyle,
        minWidth: 460,
        maxWidth: 500,
        left: pos ? pos.left : iconPicker.x,
        top: pos ? pos.top : iconPicker.y,
      }}
    >
      <div className="iconPickerHeader">
        <div className="iconPickerHeaderSelected">
          {cfg?.icon
            ? (
              <>
                <span className="iconPickerHeaderPreview">
                  {selectedIcon ? <DynamicIcon name={selectedIcon} size={16} fallback={IconFallback} /> : <IconFallback />}
                </span>
                <span className="iconPickerHeaderName">{cfg.icon}</span>
                <button
                  type="button"
                  className="iconPickerHeaderClear"
                  title="Clear icon"
                  aria-label="Clear icon"
                  onClick={() => void commit(null)}
                >
                  <X size={13} />
                </button>
              </>
              )
            : <span className="iconPickerHeaderName iconPickerHeaderNameMuted">No icon selected</span>}
        </div>
        <span className="iconPickerHeaderProvider">Icons by lucide-react</span>
      </div>

      <div style={{ padding: '4px 4px 6px' }}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') close() }}
          placeholder="Search icons…"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
          style={{
            width: '100%',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--popover-border)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            fontSize: '0.82rem',
            padding: '4px 8px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      {results.length > 0 && (
        <div className="iconPickerGrid">
          {results.map((n) => (
            <button
              key={n}
              type="button"
              className={`iconPickerGridItem${n === cfg?.icon ? ' selected' : ''}`}
              title={n}
              aria-label={n}
              onClick={() => void commit(n)}
            >
              <DynamicIcon name={n} size={20} fallback={IconFallback} />
              <span className="iconPickerGridItemLabel">{n}</span>
            </button>
          ))}
        </div>
      )}
      {results.length === 0 && (
        <div style={{ padding: '6px 10px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>No matches</div>
      )}
    </Popover>
  )
}
