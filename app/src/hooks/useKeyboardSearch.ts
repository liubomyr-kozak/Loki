import { useEffect, useRef } from 'react'
import { useAppDispatch, useAppSelector } from '../store/hooks'
import { setSearchActive, setSearchQuery, clearSearch } from '../store/slices/uiSlice'

export function useKeyboardSearch() {
  const dispatch = useAppDispatch()
  const viewMode = useAppSelector((s) => s.ui.viewMode)
  const searchActive = useAppSelector((s) => s.ui.searchActive)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewMode !== 'apps') return
      if (searchActive) {
        if (e.key === 'Escape') dispatch(clearSearch())
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (e.key.length === 1) {
        e.preventDefault()
        dispatch(setSearchActive(true))
        dispatch(setSearchQuery(e.key))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewMode, searchActive, dispatch])

  useEffect(() => {
    if (searchActive) searchInputRef.current?.focus()
  }, [searchActive])

  useEffect(() => {
    const onBlur = () => dispatch(clearSearch())
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [dispatch])

  return { searchInputRef }
}
