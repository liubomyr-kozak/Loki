import { RefreshCw } from 'lucide-react'

/**
 * Page header: title, subtitle, and the "Reset to defaults" button. The
 * button is an inline 2-step confirm (no window.confirm — that blocks the
 * WKWebView main thread) — confirming/resetting state is owned by the
 * parent so it can be reverted from a single timer and disabled while the
 * request is in flight.
 */
export function SettingsHeader({
  confirming,
  resetting,
  onReset,
}: {
  confirming: boolean
  resetting: boolean
  onReset: () => void
}) {
  return (
    <div className="settingsHeader">
      <div className="settingsHeaderText">
        <h1 className="settingsHeaderTitle">Environment</h1>
        <div className="settingsHeaderSubtitle">
          Configure how this application is executed and where it stores its data.
        </div>
      </div>
      <button
        type="button"
        className="segBtn settingsResetBtn"
        disabled={resetting}
        onClick={onReset}
      >
        <RefreshCw size={14} />
        {confirming ? 'Confirm reset?' : 'Reset to defaults'}
      </button>
    </div>
  )
}
