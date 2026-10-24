import { useEffect, useState } from 'react'
import { FolderOpen, Loader2, Trash2 } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import {
  previewPlugin,
  removePlugin,
  fetchCatalog,
  showPluginDetails,
  setPluginEnabled,
} from '../../store/slices/pluginsSlice'
import { openSettingsSection } from '../../store/slices/uiSlice'
import { PluginInstallPreview } from './PluginInstallPreview'
import { CatalogRow } from './CatalogRow'
import { ToggleSwitch } from '../pickers/ToggleSwitch'

export function PluginsPanel() {
  const dispatch = useAppDispatch()
  const plugins = useAppSelector((s) => s.plugins.list)
  const installing = useAppSelector((s) => s.plugins.installing)
  const error = useAppSelector((s) => s.plugins.error)
  const catalog = useAppSelector((s) => s.plugins.catalog)
  const catalogLoading = useAppSelector((s) => s.plugins.catalogLoading)
  const [src, setSrc] = useState('')
  // Two lists, one source of truth (config.plugins): a plugin is either
  // installed (id present) or sits in the marketplace list. marketplace/ on
  // disk is never touched by either action.
  const installed = plugins.filter((p) => p.activated)
  const notInstalled = catalog.filter((e) => !e.installed)

  useEffect(() => {
    dispatch(fetchCatalog())
  }, [dispatch])

  return (
    <div className="pluginsPanel">
      <div className="pluginInstallRow">
        <input
          className="pluginInstallInput"
          value={src}
          placeholder="Plugin folder path or .zip URL (or drop a folder here)"
          onChange={(e) => setSrc(e.target.value)}
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoComplete="off"
        />
        <button
          className="scanConfirmBtn"
          disabled={installing || !src.trim()}
          onClick={() => dispatch(previewPlugin(src.trim()))}
        >
          {installing ? <Loader2 size={14} className="spin" /> : 'Install'}
        </button>
        <button
          type="button"
          className="scanConfirmBtn pluginFolderBtn"
          title="Plugin folders (Settings → Storage)"
          aria-label="Plugin folders"
          onClick={() => dispatch(openSettingsSection('storage'))}
        >
          <FolderOpen size={14} />
        </button>
      </div>
      {!!error && <div className="cfgStatus">{error}</div>}
      {installed.length > 0
        ? (
          <div className="pluginList">
            {installed.map((p) => (
              <div className="pluginListItem" key={p.id}>
                <div
                  className="pluginListItemMeta pluginMetaClickable"
                  onClick={() => dispatch(showPluginDetails(p))}
                >
                  <span className="pluginName">{p.name}</span>
                  <span className="pluginVersion">{p.version}</span>
                  {p.risk && <span className="pluginLabelBadge">{p.risk}</span>}
                  {p.source && <span className="pluginVersion">from {p.source}</span>}
                </div>
                <div className="pluginListItemActions">
                  <ToggleSwitch
                    label=""
                    title={p.enabled ? 'Enabled' : 'Disabled'}
                    checked={p.enabled}
                    unmanaged={false}
                    onChange={(v) => dispatch(setPluginEnabled({ id: p.id, enabled: v }))}
                  />
                  <button
                    className="pluginRemoveBtn"
                    onClick={() => dispatch(removePlugin(p.id))}
                    title="Remove — moves back to the marketplace list"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          )
        : <div className="empty">No plugins installed.</div>}

      {(catalogLoading || notInstalled.length > 0) && (
        <div className="catalogSection">
          <div className="configSectionTitle">Marketplace</div>
          {catalogLoading
            ? <Loader2 size={14} className="spin" />
            : (
              <div className="pluginList">
                {notInstalled.map((entry) => (
                  <CatalogRow key={entry.id} entry={entry} />
                ))}
              </div>
              )}
        </div>
      )}

      <PluginInstallPreview />
    </div>
  )
}
