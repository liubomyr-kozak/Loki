import type React from 'react'

export interface AppRowDragHandle {
  attributes: object
  listeners: object | undefined
  dragging: boolean
}

export interface AppRowProps {
  // Row identifier — either a plain appName (the implicit default instance)
  // or a clone's instanceId. Resolve the owning appName via useAppRow's
  // returned `appName`; never use this field directly for API calls or
  // shared state lookups.
  name: string
  groupId?: string
  sortableRef?: (el: HTMLElement | null) => void
  sortableStyle?: React.CSSProperties
  dragHandle?: AppRowDragHandle
}

export interface GroupSectionSharedProps {
  renderRows: (names: string[], groupId?: string) => React.ReactNode
}
