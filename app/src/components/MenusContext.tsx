import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export interface ContextMenuState {
  appName: string
  x: number
  y: number
  // The group whose section the row was right-clicked in, when any — the menu
  // marks it "Current" so a multi-group app shows which one you came from.
  groupId?: string
  // Present and equal to the row's rowId only when the right-clicked row was
  // a clone; absent for the original row.
  instanceId?: string
}

export interface GroupMenuState {
  groupId: string
  x: number
  y: number
  derived?: boolean
  members?: string[]
}

export interface IconPickerState {
  appName: string
  x: number
  y: number
}

export interface MenusContextValue {
  contextMenu: ContextMenuState | null
  groupMenu: GroupMenuState | null
  iconPicker: IconPickerState | null
  openContextMenu: (appName: string, x: number, y: number, groupId?: string, instanceId?: string) => void
  closeContextMenu: () => void
  openGroupMenu: (groupId: string, x: number, y: number, opts?: { derived?: boolean; members?: string[] }) => void
  closeGroupMenu: () => void
  openIconPicker: (appName: string, x: number, y: number) => void
  closeIconPicker: () => void
}

const MenusContext = createContext<MenusContextValue | null>(null)

export function MenusProvider({ children }: { children: ReactNode }) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null)
  const [iconPicker, setIconPicker] = useState<IconPickerState | null>(null)

  const openContextMenu = useCallback((appName: string, x: number, y: number, groupId?: string, instanceId?: string) => {
    setContextMenu({ appName, x, y, groupId, instanceId })
  }, [])

  const closeContextMenu = useCallback(() => {
    setContextMenu(null)
  }, [])

  const openGroupMenu = useCallback((groupId: string, x: number, y: number, opts?: { derived?: boolean; members?: string[] }) => {
    setGroupMenu({ groupId, x, y, derived: opts?.derived, members: opts?.members })
  }, [])

  const closeGroupMenu = useCallback(() => {
    setGroupMenu(null)
  }, [])

  const openIconPicker = useCallback((appName: string, x: number, y: number) => {
    setIconPicker({ appName, x, y })
  }, [])

  const closeIconPicker = useCallback(() => {
    setIconPicker(null)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (groupMenu) {
        closeGroupMenu()
        return
      }
      if (contextMenu) {
        closeContextMenu()
        return
      }
      if (iconPicker) {
        closeIconPicker()
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [groupMenu, contextMenu, iconPicker, closeGroupMenu, closeContextMenu, closeIconPicker])

  const value = useMemo<MenusContextValue>(() => ({
    contextMenu,
    groupMenu,
    iconPicker,
    openContextMenu,
    closeContextMenu,
    openGroupMenu,
    closeGroupMenu,
    openIconPicker,
    closeIconPicker,
  }), [contextMenu, groupMenu, iconPicker, openContextMenu, closeContextMenu, openGroupMenu, closeGroupMenu, openIconPicker, closeIconPicker])

  return (
    <MenusContext.Provider value={value}>
      {children}
    </MenusContext.Provider>
  )
}

export function useMenus(): MenusContextValue {
  const ctx = useContext(MenusContext)
  if (!ctx) throw new Error('useMenus must be used within a MenusProvider')
  return ctx
}
