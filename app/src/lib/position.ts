export interface Pos {
  left: number
  top: number
}

export function clampToViewport(x: number, y: number, rect: DOMRect): Pos {
  return {
    left: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
    top: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
  }
}

export function anchorLeftOf(x: number, y: number, rect: DOMRect): Pos {
  const desiredLeft = x - rect.width
  const left = Math.max(8, Math.min(desiredLeft, window.innerWidth - rect.width - 8))
  const top = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8))
  return { left, top }
}

export interface AnchoredPos {
  left: number
  top: number
  maxHeight: number
  placement: 'below' | 'above'
}

export function anchorBelowOrAbove(
  triggerRect: DOMRect,
  menuSize: { width: number; height: number },
  viewport: { w: number; h: number },
  opts?: { maxRows?: number; rowH?: number; margin?: number; minWidth?: number; maxWidth?: number },
): AnchoredPos {
  const margin = opts?.margin ?? 8
  const rowH = opts?.rowH ?? 30
  const maxRows = opts?.maxRows ?? 8

  // A hidden/not-yet-laid-out webview reports innerWidth/innerHeight as 0. With
  // those numbers every flip/clamp below resolves to the top-left corner, so
  // EVERY menu lands at (margin, margin) on top of an unrelated row instead of
  // under the control that opened it. Unknown viewport = no fit information at
  // all, so trust the trigger's own rect and skip flipping/clamping entirely.
  const knownWidth = viewport.w > 0
  const knownHeight = viewport.h > 0

  const desiredHeight = maxRows * rowH

  const belowSpace = knownHeight ? viewport.h - triggerRect.bottom - margin : desiredHeight
  const aboveSpace = knownHeight ? triggerRect.top - margin : 0

  const placement: 'below' | 'above' =
    belowSpace < desiredHeight && aboveSpace > belowSpace ? 'above' : 'below'

  const availableSpace = placement === 'below' ? belowSpace : aboveSpace
  const chosenHeight = Math.max(3 * rowH, Math.min(desiredHeight, availableSpace))

  // Above-placement offsets by what the menu ACTUALLY renders, not by the
  // maxHeight budget — a 3-item menu under an 8-row budget used to float a
  // full 240px above its trigger with nothing in the gap.
  const renderedHeight = menuSize.height > 0 ? Math.min(chosenHeight, menuSize.height) : chosenHeight

  const top =
    placement === 'below'
      ? triggerRect.bottom + 4
      : Math.max(margin, triggerRect.top - renderedHeight - 4)

  const left = knownWidth
    ? Math.max(margin, Math.min(triggerRect.left, viewport.w - menuSize.width - margin))
    : triggerRect.left

  return { left, top, maxHeight: chosenHeight, placement }
}
