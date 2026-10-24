import ReactDOM from 'react-dom'
import type { ReactNode, Ref } from 'react'

const POPOVER_Z_INDEX = 9999

export const popoverStyle: React.CSSProperties = {
  position: 'fixed',
  background: 'var(--popover-bg)',
  border: '1px solid var(--popover-border)',
  borderTop: '1px solid var(--popover-border-top)',
  borderRadius: 10,
  padding: 5,
  minWidth: 180,
  maxWidth: 240,
  maxHeight: 'calc(100vh - 16px)',
  overflowY: 'auto',
  zIndex: POPOVER_Z_INDEX,
}

export const popoverItem = (color?: string): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  padding: '0 10px',
  minHeight: 32,
  borderRadius: 6,
  fontSize: '0.82rem',
  color: color ?? 'var(--text-primary)',
  cursor: 'pointer',
  userSelect: 'none',
  transition: 'background 0.1s',
})

export interface PopoverProps {
  innerRef?: Ref<HTMLDivElement>
  className: string
  style: React.CSSProperties
  children?: ReactNode
  // Dims and softly blurs the window behind the popover. Visual only
  // (pointer-events: none), so outside-click handling is unchanged. Off for
  // hover tooltips, where a flashing backdrop would be noise.
  backdrop?: boolean
}

export function Popover({ innerRef, className, style, children, backdrop = true }: PopoverProps) {
  return ReactDOM.createPortal(
    <>
      {backdrop && <div className="popoverBackdrop" style={{ zIndex: POPOVER_Z_INDEX - 1 }} />}
      <div ref={innerRef} className={`${className} popoverSurface`} style={style}>{children}</div>
    </>,
    document.body,
  )
}
