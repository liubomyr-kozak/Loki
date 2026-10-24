import { useState } from 'react'
import type { ReactNode } from 'react'
import { popoverItem } from './Popover'

const HOVER = { normal: 'var(--popover-item-hover)', danger: 'rgba(230,85,85,0.10)' }

export interface MenuItemProps {
  icon: ReactNode
  label: ReactNode
  danger?: boolean
  disabled?: boolean
  truncate?: boolean
  onSelect: (e: React.MouseEvent) => void
  ariaDisabled?: boolean
}

export function MenuItem({ icon, label, danger, disabled, truncate = true, onSelect, ariaDisabled }: MenuItemProps) {
  const [hover, setHover] = useState(false)
  const base = popoverItem(danger ? 'var(--dot-error)' : undefined)
  const bg = disabled ? 'transparent' : hover ? (danger ? HOVER.danger : HOVER.normal) : 'transparent'
  return (
    <div
      style={{ ...base, background: bg, ...(disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
      aria-disabled={ariaDisabled ?? disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => { e.stopPropagation(); if (disabled) return; onSelect(e) }}
    >
      {icon}
      {truncate
        ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{label}</span>
        : <span>{label}</span>}
    </div>
  )
}
