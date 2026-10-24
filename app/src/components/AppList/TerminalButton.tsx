import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, RotateCcw, SquareTerminal } from 'lucide-react'
import { useAppDispatch } from '../../store/hooks'
import { refreshAll, restartApp } from '../../store/slices/appsSlice'
import { api } from '../../api'
import * as tauri from '../../lib/tauri'
import * as clipboard from '../../lib/clipboard'
import { useOutsideClose } from '../../hooks/useOutsideClose'
import { claimPopover, releasePopover } from '../../lib/popoverHost'

const LONG_PRESS_MS = 600

export interface TerminalButtonProps {
  name: string
}

export async function openTerminal(name: string): Promise<void> {
  try {
    const { command, focused } = await api.getAttachCommand(name, { focus: true })
    if (focused) {
      await tauri.focusTerminal()
      return
    }
    const msg = await tauri.openInTerminal(command)
    if (!command) console.info(msg || 'No live attach for this session backend — view logs instead.')
  } catch (e) {
    console.error('Failed to open terminal', e)
  }
}

export function TerminalButton({ name }: TerminalButtonProps) {
  const dispatch = useAppDispatch()
  const [open, setOpen] = useState(false)
  const closeMenu = useCallback(() => { releasePopover(closeMenu); setOpen(false) }, [])
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired = useRef(false)

  useOutsideClose(open, closeMenu, { event: 'click' })

  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      releasePopover(closeMenu)
    }
  }, [closeMenu])

  if (open) {
    return (
      <div className="longMenu" onClick={(e) => e.stopPropagation()}>
        <button
          className="longMenuBtn"
          title="Open terminal"
          onClick={() => { void openTerminal(name); closeMenu() }}
        ><SquareTerminal size={12} /></button>
        <button
          className="longMenuBtn"
          title="Restart"
          onClick={() => {
            closeMenu()
            dispatch(restartApp({ name })).then(() => { dispatch(refreshAll()) })
          }}
        ><RotateCcw size={12} /></button>
        <button
          className="longMenuBtn"
          title="Copy tmux attach command"
          onClick={async () => {
            try {
              const { command } = await api.getAttachCommand(name)
              if (command) await clipboard.copyText(command)
            } finally {
              closeMenu()
            }
          }}
        ><Copy size={12} /></button>
      </div>
    )
  }

  return (
    <button
      className="termBtn"
      onMouseDown={(e) => {
        e.stopPropagation()
        longPressFired.current = false
        longPressTimer.current = setTimeout(() => {
          longPressFired.current = true
          claimPopover(closeMenu)
          setOpen(true)
        }, LONG_PRESS_MS)
      }}
      onMouseUp={() => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
      }}
      onMouseLeave={() => {
        if (longPressTimer.current) clearTimeout(longPressTimer.current)
      }}
      onClick={() => {
        if (longPressFired.current) return
        void openTerminal(name)
      }}
      title="Open live terminal (hold for more)"
    ><SquareTerminal size={14} /></button>
  )
}
