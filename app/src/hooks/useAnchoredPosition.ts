import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { anchorBelowOrAbove } from '../lib/position'
import type { AnchoredPos } from '../lib/position'
import { MAX_VISIBLE_ROWS, MENU_MAX_WIDTH, MENU_MIN_WIDTH, ROW_HEIGHT, VIEWPORT_MARGIN } from '../components/pickers/constants'

export function useAnchoredPosition(
  triggerRef: RefObject<HTMLElement | null>,
  menuRef: RefObject<HTMLElement | null>,
  open: boolean,
  deps: unknown[],
): AnchoredPos | null {
  const [pos, setPos] = useState<AnchoredPos | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null)
      return
    }

    const recompute = () => {
      if (!triggerRef.current) return
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const menuRect = menuRef.current?.getBoundingClientRect()
      const menuSize = {
        width: menuRect?.width ?? MENU_MIN_WIDTH,
        height: menuRect?.height ?? MAX_VISIBLE_ROWS * ROW_HEIGHT,
      }
      setPos(
        anchorBelowOrAbove(
          triggerRect,
          menuSize,
          { w: window.innerWidth, h: window.innerHeight },
          { maxRows: MAX_VISIBLE_ROWS, rowH: ROW_HEIGHT, margin: VIEWPORT_MARGIN, minWidth: MENU_MIN_WIDTH, maxWidth: MENU_MAX_WIDTH },
        ),
      )
    }

    recompute()
    window.addEventListener('resize', recompute)
    window.addEventListener('scroll', recompute, true)
    return () => {
      window.removeEventListener('resize', recompute)
      window.removeEventListener('scroll', recompute, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, triggerRef, menuRef, ...deps])

  return pos
}
