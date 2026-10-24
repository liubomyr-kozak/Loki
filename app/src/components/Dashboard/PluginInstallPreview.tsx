import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { closePreview, installPlugin, fetchCatalog } from '../../store/slices/pluginsSlice'

export function PluginInstallPreview() {
  const dispatch = useAppDispatch()
  const preview = useAppSelector((s) => s.plugins.preview)
  const previewSource = useAppSelector((s) => s.plugins.previewSource)
  const installing = useAppSelector((s) => s.plugins.installing)
  const list = useAppSelector((s) => s.plugins.list)

  const cancel = () => dispatch(closePreview())

  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispatch(closePreview())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview, dispatch])

  if (!preview) return null

  const { manifest } = preview
  const detailsOnly = !previewSource
  const isInstalled = list.some((p) => p.id === manifest.id && p.activated)

  const install = () => {
    dispatch(installPlugin(previewSource)).then(() => { dispatch(fetchCatalog()) })
  }

  return (
    <div className="modalOverlay" onClick={cancel}>
      <div className="modalCard" onClick={(e) => e.stopPropagation()}>
        <div className="modalTitle">{detailsOnly ? 'Plugin details' : 'Install plugin?'}</div>

        <div className="modalRow">
          <span className="pluginName">{manifest.name}</span>
          <span className="pluginVersion">{manifest.version}</span>
        </div>
        <div className="modalRow">
          <span className="configKey">{manifest.id}</span>
        </div>
        {manifest.description && <div className="modalRow">{manifest.description}</div>}

        {manifest.risk && (
          <div className="modalRow modalDanger">
            Risk
            <code>{manifest.risk}</code>
          </div>
        )}

        <div className="modalActions">
          {detailsOnly
            ? <button className="modalBtn" onClick={cancel}>Close</button>
            : (
              <>
                <button className="modalBtn" onClick={cancel} disabled={installing}>Cancel</button>
                {isInstalled
                  ? <button className="modalBtn" disabled>Installed</button>
                  : (
                    <button
                      className={`modalBtn${manifest.risk ? ' danger' : ''}`}
                      onClick={install}
                      disabled={installing}
                    >
                      {installing ? <Loader2 size={14} className="spin" /> : 'Install'}
                    </button>
                    )}
              </>
              )}
        </div>
      </div>
    </div>
  )
}
