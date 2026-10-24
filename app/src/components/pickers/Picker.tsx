import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, GitBranch, Globe, Search, Trash2 } from 'lucide-react'
import { Popover } from '../portals/Popover'
import { useCombobox } from '../../hooks/useCombobox'
import { useAnchoredPosition } from '../../hooks/useAnchoredPosition'
import { useOutsideClose } from '../../hooks/useOutsideClose'
import { claimPopover, releasePopover } from '../../lib/popoverHost'
import { DROP_STASH_ITEM, PICKER_MENU_Z_INDEX } from './constants'

export interface PickerProps {
  value: string
  options: string[]
  disabled?: boolean
  onOpen?: () => void
  onSelect: (v: string) => void
  variant: 'env' | 'branch'
  badges?: { dirty?: boolean; stashAvailable?: boolean; conflict?: boolean }
  loading?: boolean
  errorText?: string
  /* renders a dropdown chevron after the value (pill-style triggers) */
  caret?: boolean
}

export function Picker({ value, options, disabled, onOpen, onSelect, variant, badges, loading, errorText, caret }: PickerProps) {
  const triggerClassName = variant === 'env'
    ? 'pickerTrigger chip-env'
    : 'pickerTrigger chip-branch'

  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => () => releasePopover(close), [close])

  useOutsideClose(open, close, { selector: '.pickerMenuPortal', event: 'click' })

  const onTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (open) {
      releasePopover(close)
      setOpen(false)
      return
    }
    claimPopover(close)
    setOpen(true)
    onOpen?.()
  }

  const onOptionSelect = (v: string) => {
    releasePopover(close)
    setOpen(false)
    onSelect(v)
  }

  const cb = useCombobox({
    options,
    value,
    open,
    isActionItem: (o) => o === DROP_STASH_ITEM,
    onSelect: onOptionSelect,
    onClose: close,
  })
  const pos = useAnchoredPosition(triggerRef, menuRef, open, [cb.filtered.length, cb.searchEnabled])

  useEffect(() => {
    if (open && !cb.searchEnabled) {
      cb.listRef.current?.focus()
    }
  }, [open, cb.searchEnabled])

  const inputActiveDescendant = open ? cb.activeId ?? undefined : undefined
  const listboxActiveDescendant = open && !cb.searchEnabled ? cb.activeId ?? undefined : undefined

  const dropStashIndex = cb.filtered.indexOf(DROP_STASH_ITEM)

  return (
    <div className="pickerWrap">
      <button
        ref={triggerRef}
        className={triggerClassName}
        disabled={disabled}
        onClick={onTriggerClick}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={cb.listboxId}
      >
        <span className="chipValue">
          {variant === 'branch'
            ? <GitBranch size={14} className="chipIcon" />
            : <Globe size={14} className="chipIcon" />}
          <span className="chipText" title={value}>{value}</span>
          {badges?.dirty && <span className="pickerBadge dirty" title="uncommitted changes" />}
          {badges?.stashAvailable && <span className="pickerBadge stash" title="stash available" />}
          {badges?.conflict && <span className="pickerBadge conflict" title="conflict" />}
          {caret && <ChevronDown size={12} className="chipCaretIcon" />}
        </span>
      </button>
      {open && (
        <Popover
          innerRef={menuRef}
          className="pickerMenuPortal"
          style={{
            position: 'fixed',
            left: pos?.left,
            top: pos?.top,
            maxHeight: pos?.maxHeight,
            zIndex: PICKER_MENU_Z_INDEX,
          }}
        >
          {cb.searchEnabled && (
            <span className="pickerSearchInput">
              <Search size={13} />
              <input
                ref={cb.inputRef}
                value={cb.query}
                onChange={(e) => cb.setQuery(e.target.value)}
                onKeyDown={cb.onKeyDown}
                aria-activedescendant={inputActiveDescendant}
                autoFocus
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                autoComplete="off"
              />
            </span>
          )}
          <div
            ref={cb.listRef}
            className="pickerMenu"
            role="listbox"
            id={cb.listboxId}
            tabIndex={cb.searchEnabled ? undefined : -1}
            onKeyDown={cb.searchEnabled ? undefined : cb.onKeyDown}
            aria-activedescendant={listboxActiveDescendant}
          >
            {cb.filtered.map((o, i) => {
              const isDropStash = o === DROP_STASH_ITEM
              return (
                <Fragment key={o}>
                  {isDropStash && i === dropStashIndex && <div className="pickerSeparator" />}
                  <div
                    ref={(el) => cb.registerItem(el, i)}
                    role="option"
                    aria-selected={o === value}
                    id={cb.optionId(i)}
                    className={
                      `pickerItem${o === value ? ' active' : ''}${i === cb.activeIndex ? ' cursor' : ''}${isDropStash ? ' pickerItemDropStash' : ''}`
                    }
                    onClick={() => onOptionSelect(o)}
                  >
                    {isDropStash
                      ? <Trash2 size={13} />
                      : variant === 'branch' && <GitBranch size={13} />}
                    <span className="pickerItemLabel" title={o}>{o}</span>
                    {o === value && <Check size={13} className="pickerItemCheck" />}
                  </div>
                </Fragment>
              )
            })}
            {loading && cb.filtered.length === 0 && (
              <div className="pickerMenuEmpty">Loading branches…</div>
            )}
            {!loading && errorText && cb.filtered.length === 0 && (
              <div className="pickerMenuEmpty">{errorText}</div>
            )}
            {!loading && !errorText && cb.filtered.length === 0 && cb.query !== '' && (
              <div className="pickerMenuEmpty">No matches</div>
            )}
          </div>
        </Popover>
      )}
    </div>
  )
}
