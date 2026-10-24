import { useRef, useState } from 'react'
import { X } from 'lucide-react'
import { useOutsideClose } from '../../hooks/useOutsideClose'

export interface ChipOption {
  key: string
  label: string
}

export interface ChipListEditorProps {
  selectedKeys: string[]
  chipLabel: (key: string) => string
  addable: ChipOption[]
  onAdd: (key: string) => void
  onRemove: (key: string) => void
  addButtonLabel: string
  searchPlaceholder: string
  allowCreate?: boolean
  hasExactMatch?: (query: string) => boolean
  createLabel?: (query: string) => string
  hideAddWhenEmpty?: boolean
}

export function ChipListEditor({
  selectedKeys,
  chipLabel,
  addable,
  onAdd,
  onRemove,
  addButtonLabel,
  searchPlaceholder,
  allowCreate = false,
  hasExactMatch,
  createLabel,
  hideAddWhenEmpty = false,
}: ChipListEditorProps) {
  const [open, setOpen] = useState(false)
  const [openUp, setOpenUp] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const matched = addable.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
  const showCreate = allowCreate && query !== '' && !hasExactMatch?.(query)
  const rows: Array<{ key: string; label: string; create?: boolean }> = showCreate
    ? [...matched, { key: '__create__', label: createLabel!(query), create: true }]
    : matched

  useOutsideClose(open, () => setOpen(false), { ref: wrapRef, event: 'mousedown' })

  const openPopover = () => {
    setQuery('')
    setActiveIndex(0)
    const rect = wrapRef.current?.getBoundingClientRect()
    setOpenUp(rect != null && window.innerHeight - rect.bottom < 240)
    setOpen(true)
  }

  const closePopover = () => {
    setOpen(false)
  }

  const commit = (key: string, isCreate = false) => {
    onAdd(isCreate ? query : key)
    closePopover()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(rows.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows.length === 0) {
        if (allowCreate && query.trim()) {
          onAdd(query.trim())
          closePopover()
        }
        return
      }
      const r = rows[activeIndex] ?? rows[0]
      if (r) commit(r.key, r.create)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closePopover()
    }
  }

  const showAddBtn = !hideAddWhenEmpty || addable.length > 0

  return (
    <div className="dependsEditor" ref={wrapRef}>
      {selectedKeys.map((k) => (
        <span className="depChip" key={k}>
          {chipLabel(k)}
          <button
            type="button"
            className="depChipRemove"
            onClick={() => onRemove(k)}
            aria-label={`Remove ${k}`}
          >
            <X size={10} />
          </button>
        </span>
      ))}
      {showAddBtn && (
        <button
          type="button"
          className="depAdd depAddBtn"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? closePopover() : openPopover())}
        >
          {addButtonLabel}
        </button>
      )}
      {/* Same dimmed backdrop as the portaled popovers, one layer under .depPopover (z-index 20). */}
      {open && <div className="popoverBackdrop" style={{ zIndex: 19 }} />}
      {open && (
        <div className={`depPopover${openUp ? ' depPopover--up' : ''}`}>
          <input
            className="depSearch"
            placeholder={searchPlaceholder}
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
            onKeyDown={handleKeyDown}
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            autoComplete="off"
          />
          <ul role="listbox" className="depList">
            {rows.length === 0 && <li className="depListEmpty">No matches</li>}
            {rows.map((r, i) => (
              <li
                key={r.key}
                role="option"
                aria-selected={i === activeIndex}
                className={`depListItem${i === activeIndex ? ' active' : ''}`}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseDown={(e) => { e.preventDefault(); commit(r.key, r.create) }}
              >
                {r.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
