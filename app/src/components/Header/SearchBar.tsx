import { RefObject } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { setSearchQuery, clearSearch } from '../../store/slices/uiSlice'

export interface SearchBarProps {
  searchInputRef: RefObject<HTMLInputElement | null>
}

export function SearchBar({ searchInputRef }: SearchBarProps) {
  const dispatch = useAppDispatch()
  const searchQuery = useAppSelector((s) => s.ui.searchQuery)

  return (
    <>
      <input
        ref={searchInputRef}
        value={searchQuery}
        onChange={(e) => dispatch(setSearchQuery(e.target.value))}
        placeholder="Search apps…"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: 1,
          background: 'none',
          border: 'none',
          outline: 'none',
          fontSize: '0.9rem',
          color: 'inherit',
          minWidth: 0,
        }}
      />
      <button
        onClick={() => dispatch(clearSearch())}
        style={{ background: 'none', border: 'none', color: '#9aa', cursor: 'pointer', fontSize: '16px', padding: '4px', lineHeight: 1 }}
        title="Clear search"
      >×</button>
    </>
  )
}
