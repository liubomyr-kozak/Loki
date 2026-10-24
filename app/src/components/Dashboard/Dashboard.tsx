import { useEffect, useState } from 'react'
import { Blocks, FolderOpen, LayoutGrid, Plus, Settings as SettingsIcon, X } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchConfig } from '../../store/slices/appsSlice'
import { setDashboardTab, DASHBOARD_TABS, type DashboardTab } from '../../store/slices/uiSlice'
import { previewPlugin } from '../../store/slices/pluginsSlice'
import { useFolderDrop } from '../../hooks/useFolderDrop'
import { AppConfigDetail } from './AppConfigDetail'
import { ImportProposal } from './ImportProposal'
import { PluginsPanel } from './PluginsPanel'
import { EnvironmentSettings } from '../Settings/EnvironmentSettings'
import * as tauri from '../../lib/tauri'
import { WORKSPACE_NAME } from '../../lib/constants'
import { LokiMark } from '../common/LokiMark'

declare global {
  interface Window {
    __openDashboardTab?: (tab: string | null, app?: string | null) => void
  }
}

export function Dashboard() {
  const dispatch = useAppDispatch()
  const config = useAppSelector((s) => s.apps.config)
  const apps = useAppSelector((s) => s.apps.apps)
  const dashboardTab = useAppSelector((s) => s.ui.dashboardTab)
  const names = config ? Object.keys(config.apps) : []

  // Seeded from `?app=` (set by enter_dashboard when the launcher's row menu
  // asks for one app's settings). It stays a plain name here — `current` below
  // resolves it against the config, which may still be loading on first render.
  const [selectedApp, setSelectedApp] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('app'),
  )
  const [pickedPath, setPickedPath] = useState<string | null>(null)
  const { dropPath, dragging, clear } = useFolderDrop()
  // A dropped folder means different things per tab: on `plugins` it is a
  // plugin source (staged and previewed by PluginInstallPreview); on
  // `environment` it feeds the Settings → Storage Merge/Replace flow
  // (SettingsDropField below); everywhere else it is a project to import.
  // Routing it by tab keeps the app importer from validating a plugin
  // folder as a Node project, and keeps a Settings-tab drop from also
  // raising the app-import proposal (colliding write targets).
  const droppedOnPlugins = dashboardTab === 'plugins'
  const droppedOnSettings = dashboardTab === 'environment'
  const importPath = droppedOnPlugins || droppedOnSettings ? pickedPath : dropPath ?? pickedPath

  useEffect(() => {
    if (!dropPath || !droppedOnPlugins) return
    dispatch(previewPlugin(dropPath))
    clear()
  }, [dropPath, droppedOnPlugins, dispatch])

  // `dropPath` lives in this single shared hook regardless of tab, so a drop
  // left unconsumed while switching tabs would otherwise "leak" into the
  // newly active tab's consumer (Apps' ImportProposal <-> Settings'
  // SettingsDropField) on the next render. Clearing on every tab change
  // keeps each drop scoped to the tab it landed on.
  useEffect(() => {
    clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardTab])

  // The launcher window can't reach this window's store, so Rust delivers the
  // requested tab via direct eval on re-entry (see enter_dashboard in main.rs,
  // same channel as window.__launcherReset).
  useEffect(() => {
    window.__openDashboardTab = (tab, app) => {
      if (tab && (DASHBOARD_TABS as readonly string[]).includes(tab)) {
        dispatch(setDashboardTab(tab as DashboardTab))
      }
      // Config here can be older than the launcher's (it refetches on every
      // popover reveal), so accept the name as-is and let `current` validate
      // it once the refetch below lands.
      if (app) {
        setSelectedApp(app)
        dispatch(fetchConfig())
      }
    }
    return () => {
      delete window.__openDashboardTab
    }
  }, [dispatch])

  const browseForProject = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const selected = await invoke<string | null>('plugin:dialog|open', {
        options: { directory: true, multiple: false },
      })
      if (typeof selected === 'string' && selected) setPickedPath(selected)
    } catch (e) {
      console.error('folder picker failed:', e)
    }
  }

  const close = async () => {
    await tauri.exitDashboard()
  }

  const onHeadMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target !== e.currentTarget && !target.classList.contains('ws')) return
    void tauri.startWindowDrag()
  }

  const current = selectedApp && names.includes(selectedApp) ? selectedApp : names[0] ?? null

  return (
    <div className="dashboard">
      <div className="dashboardHead" onMouseDown={onHeadMouseDown}>
        <span className="ws wsBrand" style={{ textTransform: 'none' }}><LokiMark />{WORKSPACE_NAME}</span>
        <div className="segmented dashboardTabs">
          {DASHBOARD_TABS.map((t) => (
            <button
              key={t}
              className={`segBtn${dashboardTab === t ? ' active' : ''}`}
              onClick={() => dispatch(setDashboardTab(t))}
            >
              {t === 'apps' ? <LayoutGrid size={14} /> : t === 'plugins' ? <Blocks size={14} /> : <SettingsIcon size={14} />}
              {t === 'apps' ? 'Apps' : t === 'plugins' ? 'Plugins' : 'Settings'}
            </button>
          ))}
        </div>
        <button className="dashboardClose" onClick={close} title="Close">
          <X size={16} />
        </button>
      </div>
      {dashboardTab === 'apps'
        ? names.length === 0
          ? (
            <div className="dashboardBody">
              <div className="emptyState">
                <FolderOpen size={28} className="emptyStateIcon" />
                <div className="emptyStateTitle">No apps yet</div>
                <div className="emptyStateHint">
                  Drag a project folder anywhere into this window, or pick one from disk to import it.
                </div>
                <button className="scanConfirmBtn" onClick={() => void browseForProject()}>
                  Browse folder…
                </button>
              </div>
            </div>
            )
          : (
            <div className="dashboardBody">
              <div className="dashboardList">
                {names.map((name) => (
                  <div
                    key={name}
                    className={`dashboardListRow ${current === name ? 'selected' : ''}`}
                    onClick={() => setSelectedApp(name)}
                  >
                    <span className={`dot ${apps[name]?.process ?? 'unknown'}`} />
                    <span className="label">{config?.apps[name]?.label ?? name}</span>
                  </div>
                ))}
                <button className="dashboardListAdd" onClick={() => void browseForProject()}>
                  <Plus size={14} />
                  <span>Add app</span>
                </button>
              </div>
              <div className="dashboardDetail">
                {current
                  ? <AppConfigDetail key={current} name={current} />
                  : <div className="empty">Select an app to view its configuration.</div>}
              </div>
            </div>
            )
        : dashboardTab === 'plugins'
          ? (
            <div className="dashboardBody">
              <div className="dashboardDetail">
                <PluginsPanel />
              </div>
            </div>
            )
          : (
            <div className="dashboardBody">
              <div className="dashboardDetail">
                <EnvironmentSettings
                  incomingDropPath={droppedOnSettings ? dropPath : null}
                  onClearDrop={clear}
                />
              </div>
            </div>
            )}
      {dragging && (
        <div className="dropOverlay">
          <div className="dropOverlayText">
            {droppedOnPlugins
              ? 'Drop plugin folder to install'
              : droppedOnSettings
                ? 'Drop a folder with your config file to import settings'
                : 'Drop project folder to import'}
          </div>
        </div>
      )}
      {importPath && (
        <ImportProposal
          path={importPath}
          onClose={() => {
            clear()
            setPickedPath(null)
          }}
        />
      )}
    </div>
  )
}
