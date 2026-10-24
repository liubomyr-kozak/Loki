import { LayoutGrid, Loader2, Pencil, RefreshCw, RotateCw } from 'lucide-react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { openConfigInEditor, reloadConfig } from '../../store/slices/appsSlice'
import { restartLoki } from '../../store/slices/desktopSlice'
import { TINTS, setTheme, setThemeStyle, setThemeTint } from '../../store/slices/themeSlice'
import { onWorkspaceOpened } from '../../usecases/menuNavigation'
import { useAutostart } from '../../hooks/useAutostart'
import { quitApp } from '../../lib/tauri'
import { SettingsRowMeta } from './SettingsRowMeta'

export function SettingsView() {
  const dispatch = useAppDispatch()
  const { autostart, toggle } = useAutostart()
  const cfgMsg = useAppSelector((s) => s.apps.cfgMsg)
  const { theme, style, tint } = useAppSelector((s) => s.theme)
  const restartPhase = useAppSelector((s) => s.desktop.restartPhase)
  const restarting = restartPhase === 'building' || restartPhase === 'restarting'

  return (
    <div className="settings">
      <div className="settingsGroup">
        <div className="settingsGroupTitle">Configuration</div>
        <div className="settingsCard">
          <div
            className="settingsItem clickable"
            onClick={() => dispatch(onWorkspaceOpened())}
          >
            <SettingsRowMeta label="Workspace" desc="Open every app in a centered grid" />
            <span className="chevron"><LayoutGrid size={14} /></span>
          </div>
          <div className="settingsItem clickable" onClick={() => dispatch(openConfigInEditor())}>
            <SettingsRowMeta label="Edit in your editor" desc="Opens the config file in your default app" />
            <span className="chevron"><Pencil size={14} /></span>
          </div>
          <div className="settingsItem clickable" onClick={() => dispatch(reloadConfig())}>
            <SettingsRowMeta label="Reload configuration" desc="Apply changes you saved on disk" />
            <span className="chevron"><RotateCw size={14} /></span>
          </div>
          <div
            className={`settingsItem${restarting ? '' : ' clickable'}`}
            onClick={() => { if (!restarting) dispatch(restartLoki()) }}
          >
            <SettingsRowMeta
              label="Restart Loki"
              desc={
                restartPhase === 'building'
                  ? 'Rebuilding…'
                  : restartPhase === 'restarting'
                    ? 'Restarting…'
                    : restartPhase === 'failed'
                      ? (cfgMsg || 'Restart failed')
                      : 'Rebuild and restart the app itself (Cmd+R)'
              }
            />
            <span className="chevron">
              {restarting ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            </span>
          </div>
        </div>
        <div className="cfgStatus">{cfgMsg}</div>
      </div>

      <div className="settingsGroup">
        <div className="settingsGroupTitle">General</div>
        <div className="settingsCard">
          <label className="settingsItem">
            <SettingsRowMeta label="Launch at login" desc="Start automatically when you sign in" />
            <span className="switch">
              <input
                type="checkbox"
                checked={!!autostart}
                disabled={autostart === null}
                onChange={toggle}
              />
              <span className="slider" />
            </span>
          </label>
        </div>
      </div>

      <div className="settingsGroup">
        <div className="settingsGroupTitle">Appearance</div>
        <div className="settingsCard">
          <div className="settingsItem">
            <SettingsRowMeta label="Theme" desc="Choose your preferred appearance" />
            <div className="segmented">
              {(['auto', 'light', 'dark'] as const).map((t) => (
                <button
                  key={t}
                  className={`segBtn${theme === t ? ' active' : ''}`}
                  onClick={() => dispatch(setTheme(t))}
                >
                  {t === 'auto' ? '⬡' : t === 'light' ? '☀' : '☾'}
                </button>
              ))}
            </div>
          </div>
          <div className="settingsItem">
            <SettingsRowMeta label="Style" desc="Solid panels or translucent glass" />
            <div className="segmented">
              {(['solid', 'glass'] as const).map((st) => (
                <button
                  key={st}
                  className={`segBtn${style === st ? ' active' : ''}`}
                  onClick={() => dispatch(setThemeStyle(st))}
                >
                  {st === 'solid' ? 'Solid' : 'Glass'}
                </button>
              ))}
            </div>
          </div>
          <div className="settingsItem">
            <SettingsRowMeta label="Tint" desc="Accent and background color" />
            <div className="tintPicker">
              {TINTS.map((t) => (
                <button
                  key={t}
                  className={`tintSwatch${tint === t ? ' active' : ''}`}
                  data-swatch={t}
                  title={t[0].toUpperCase() + t.slice(1)}
                  aria-label={t}
                  aria-pressed={tint === t}
                  onClick={() => dispatch(setThemeTint(t))}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <button
        className="btnQuit"
        onClick={() => quitApp()}
      >
        Quit App
      </button>
    </div>
  )
}
