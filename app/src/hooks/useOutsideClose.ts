import { useEffect, type RefObject } from 'react'

export function useOutsideClose(
  active: boolean,
  onClose: () => void,
  opts?: { selector?: string; ref?: RefObject<HTMLElement | null>; event?: 'click' | 'mousedown' },
): void {
  const selector = opts?.selector
  const ref = opts?.ref
  const eventName = opts?.event ?? 'click'

  useEffect(() => {
    if (!active) return
    const handler = (e: Event) => {
      const target = e.target as HTMLElement
      if (ref) {
        if (!ref.current?.contains(target)) onClose()
      } else if (selector) {
        if (!target.closest(selector)) onClose()
      } else {
        onClose()
      }
    }
    document.addEventListener(eventName, handler)
    return () => document.removeEventListener(eventName, handler)
  }, [active, onClose, selector, ref, eventName])
}
