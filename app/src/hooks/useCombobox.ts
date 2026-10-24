import { useEffect, useId, useRef, useState } from 'react'
import { SEARCH_THRESHOLD } from '../components/pickers/constants'

export interface UseComboboxArgs {
  options: string[]
  value: string
  open: boolean
  searchThreshold?: number
  isActionItem?: (o: string) => boolean
  onSelect: (o: string) => void
  onClose: () => void
}

export interface UseCombobox {
  query: string
  setQuery: (q: string) => void
  filtered: string[]
  activeIndex: number
  searchEnabled: boolean
  activeId: string | null
  listboxId: string
  optionId: (i: number) => string
  onKeyDown: (e: React.KeyboardEvent) => void
  registerItem: (el: HTMLElement | null, i: number) => void
  listRef: React.RefObject<HTMLDivElement | null>
  inputRef: React.RefObject<HTMLInputElement | null>
}

function filterOptions(options: string[], query: string, isActionItem?: (o: string) => boolean): string[] {
  const isAction = isActionItem ?? (() => false)
  const q = query.toLowerCase()
  const normal = options.filter((o) => !isAction(o) && o.toLowerCase().includes(q))
  const action = options.filter((o) => isAction(o))
  return [...normal, ...action]
}

export function useCombobox(args: UseComboboxArgs): UseCombobox {
  const { options, value, open, searchThreshold, isActionItem, onSelect, onClose } = args

  const rawId = useId()
  const listboxId = `combobox-${rawId}`
  const optionId = (i: number) => `${listboxId}-opt-${i}`

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemEls = useRef<Map<number, HTMLElement>>(new Map())

  const searchEnabled = options.length >= (searchThreshold ?? SEARCH_THRESHOLD)
  const filtered = filterOptions(options, query, isActionItem)

  const wasOpen = useRef(open)
  useEffect(() => {
    if (open && !wasOpen.current) {
      setQuery('')
      const fresh = filterOptions(options, '', isActionItem)
      const idx = fresh.indexOf(value)
      setActiveIndex(idx >= 0 ? idx : 0)
    }
    wasOpen.current = open
  }, [open, options, value, isActionItem])

  useEffect(() => {
    setActiveIndex((i) => (filtered.length === 0 ? 0 : Math.min(i, filtered.length - 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length])

  useEffect(() => {
    itemEls.current.get(activeIndex)?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const registerItem = (el: HTMLElement | null, i: number) => {
    if (el) itemEls.current.set(i, el)
    else itemEls.current.delete(i)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
        return
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        return
      case 'Home':
        e.preventDefault()
        setActiveIndex(0)
        return
      case 'End':
        e.preventDefault()
        setActiveIndex(Math.max(filtered.length - 1, 0))
        return
      case 'Enter':
        e.preventDefault()
        if (filtered.length === 0) return
        onSelect(filtered[activeIndex])
        return
      case 'Escape':
        e.preventDefault()
        onClose()
        return
      case 'Backspace':
        // Only this hook's own type-ahead query needs manual erasing — when
        // searchEnabled the controlled <input>'s own onChange already handles
        // Backspace, so touching query here would double up the edit.
        if (!searchEnabled) {
          e.preventDefault()
          setQuery((q) => q.slice(0, -1))
        }
        return
      default:
        // Only the no-search type-ahead path writes to query here — when
        // searchEnabled, the controlled <input>'s own onChange is the sole
        // writer, so appending here too double-writes every keystroke.
        if (!searchEnabled && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          setQuery((q) => q + e.key)
        }
    }
  }

  const activeId = filtered.length > 0 ? optionId(activeIndex) : null

  return {
    query,
    setQuery,
    filtered,
    activeIndex,
    searchEnabled,
    activeId,
    listboxId,
    optionId,
    onKeyDown,
    registerItem,
    listRef,
    inputRef,
  }
}
