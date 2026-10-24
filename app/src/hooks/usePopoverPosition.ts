import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'
import { clampToViewport, anchorLeftOf } from '../lib/position'
import type { Pos } from '../lib/position'

export function usePopoverPosition(
  anchor: { x: number; y: number } | null,
  ref: RefObject<HTMLElement | null>,
  deps: unknown[],
  mode: 'clamp' | 'anchorLeft' = 'clamp',
): Pos | null {
  const [pos, setPos] = useState<Pos | null>(null)

  useLayoutEffect(() => {
    if (!anchor || !ref.current) {
      setPos(null)
      return
    }
    const rect = ref.current.getBoundingClientRect()
    setPos(mode === 'anchorLeft' ? anchorLeftOf(anchor.x, anchor.y, rect) : clampToViewport(anchor.x, anchor.y, rect))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, ref, mode, ...deps])

  return pos
}
