import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { installPlugin, setPluginActivated, fetchCatalog, showPluginDetails } from '../../store/slices/pluginsSlice'
import type { CatalogEntry } from '../../api'

export function CatalogRow({ entry }: { entry: CatalogEntry }) {
  const dispatch = useAppDispatch()
  const plugins = useAppSelector((s) => s.plugins.list)
  // Installing is the button's job only — the row itself is not clickable, so
  // reading a description can never turn into an unintended install.
  // A plugin already on disk (bundled, or in one of your plugins folders) is
  // switched on in place; only a remote/unknown source needs copying.
  const install = () => {
    const done = entry.onDisk
      ? dispatch(setPluginActivated({ id: entry.id, activated: true }))
      : dispatch(installPlugin(entry.manifestUrl))
    done.then(() => { dispatch(fetchCatalog()) })
  }
  // Details are looked up from the already-loaded plugin list (same data
  // source installed rows use), never a new backend call. Silent no-op if
  // the entry has no matching record on disk.
  const openDetails = () => {
    const p = plugins.find((p) => p.id === entry.id)
    if (p) dispatch(showPluginDetails(p))
  }

  return (
    <div className="catalogItem">
      <div className="pluginListItemMeta pluginMetaClickable" onClick={openDetails} title={entry.folder}>
        <span className="pluginName">{entry.name}</span>
        <span className="catalogDesc">{entry.description}</span>
      </div>
      <button className="scanConfirmBtn" onClick={install}>
        Install
      </button>
    </div>
  )
}
