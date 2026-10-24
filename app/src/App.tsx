import { useAppSelector } from './store/hooks'
import { usePolling } from './hooks/usePolling'
import { useTheme } from './hooks/useTheme'
import { useKeyboardSearch } from './hooks/useKeyboardSearch'
import { useRestartHotkey } from './hooks/useRestartHotkey'
import { useTrayCount } from './hooks/useTrayCount'
import { useTrayNavigationSync } from './hooks/useTrayNavigationSync'
import { getWindowRole } from './hooks/windowRole'
import { MenusProvider } from './components/MenusContext'
import { Header } from './components/Header/Header'
import { AppList } from './components/AppList/AppList'
import { SettingsView } from './components/Settings/SettingsView'
import { DockBar } from './components/AppList/DockBar'
import { AppContextMenu } from './components/portals/AppContextMenu'
import { GroupMenu } from './components/portals/GroupMenu'
import { GroupStartConflictDialog } from './components/Groups/GroupStartConflictDialog'
import { IconPicker } from './components/portals/IconPicker'
import { Dashboard } from './components/Dashboard/Dashboard'

const windowRole = getWindowRole()

export default function App() {
  usePolling()
  useTheme()
  useTrayCount()
  useTrayNavigationSync()
  const { searchInputRef } = useKeyboardSearch()
  useRestartHotkey()

  const configLoaded = useAppSelector((s) => s.apps.configLoaded)
  const viewMode = useAppSelector((s) => s.ui.viewMode)

  if (!configLoaded) {
    return <div className="loading">Connecting to orchestrator…</div>
  }

  // The Workspace window renders the Dashboard and nothing else — the
  // popover UI (Header/AppList/DockBar) belongs to the launcher window.
  if (windowRole === 'workspace') {
    return (
      <MenusProvider>
        <Dashboard />
        <IconPicker />
      </MenusProvider>
    )
  }

  return (
    <MenusProvider>
      <div className="app">
        <Header searchInputRef={searchInputRef} />
        <div className="list">
          {viewMode === 'apps' ? <AppList /> : <SettingsView />}
        </div>
        {viewMode === 'apps' && <DockBar />}
        <AppContextMenu />
        <GroupMenu />
        <GroupStartConflictDialog />
        <IconPicker />
      </div>
    </MenusProvider>
  )
}
