import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    // Dev-only escape hatch: Tauri's native drag-drop event never reaches a
    // plain browser tab, so there is no way to drive this hook's `dropPath`
    // state from a dev-browser Browser pane. Under `import.meta.env.DEV`
    // this calls the SAME setDropPath the real onDragDropEvent branch uses,
    // so every consumer (Dashboard's ImportProposal routing, Settings'
    // SettingsDropField) sees an identical state transition either way.
    __simulateFolderDrop?: (path: string) => void
  }
}

export function useFolderDrop() {
  const [dragging, setDragging] = useState(false)
  const [dropPath, setDropPath] = useState<string | null>(null)
  const unlistenRef = useRef<(() => void) | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    import('@tauri-apps/api/webview')
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((event) => {
          const type = event.payload.type
          if (type === 'enter' || type === 'over') {
            setDragging(true)
          } else if (type === 'leave') {
            setDragging(false)
          } else if (type === 'drop') {
            setDragging(false)
            const paths = (event.payload as { paths?: string[] }).paths
            if (paths && paths.length > 0) setDropPath(paths[0])
          }
        }),
      )
      .then((fn) => {
        if (cancelled) fn()
        else unlistenRef.current = fn
      })
      .catch(() => { /* not running under Tauri */ })

    if (import.meta.env.DEV) {
      window.__simulateFolderDrop = (path: string) => setDropPath(path)
    }

    return () => {
      cancelled = true
      unlistenRef.current?.()
      if (import.meta.env.DEV) {
        delete window.__simulateFolderDrop
      }
    }
  }, [])

  const clear = () => setDropPath(null)

  return { dropPath, dragging, clear }
}
