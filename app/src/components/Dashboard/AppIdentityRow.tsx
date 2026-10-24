import { Package, SquareTerminal } from 'lucide-react'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { AppConfig } from '../../api'
import { resolveAppIcon } from '../../lib/appIcon'
import * as tauri from '../../lib/tauri'
import { InlineEdit } from './InlineEdit'
import { AppIconPlaceholder } from './AppIconPlaceholder'

// Single-quote a path for embedding in a shell command (the same command
// string is handed to the native `open_in_terminal` invoke, which runs it
// through the user's shell — so it needs to survive spaces/quotes in paths).
const shellQuote = (p: string) => `'${p.replace(/'/g, `'\\''`)}'`

export function AppIdentityRow({
  name,
  label,
  icon,
  repoPath,
  onOpenIconPicker,
  onSaveLabel,
}: {
  name: string
  label: string
  icon: AppConfig['icon']
  repoPath?: string
  onOpenIconPicker: (name: string, x: number, y: number) => void
  onSaveLabel: (v: string) => void
}) {
  const headerIcon = (() => {
    const effIcon = resolveAppIcon(icon)
    return effIcon.kind === 'library'
      ? <DynamicIcon name={effIcon.name} size={16} fallback={AppIconPlaceholder} />
      : <AppIconPlaceholder />
  })()

  return (
    <div className="appConfigHeader">
      <button
        type="button"
        className="appConfigHeaderIcon"
        title="Change icon"
        aria-label="Change icon"
        onClick={(e) => onOpenIconPicker(name, e.clientX + 4, e.clientY)}
      >
        {headerIcon}
      </button>
      <InlineEdit
        value={label}
        onSave={onSaveLabel}
        className="appConfigHeaderTitleEdit"
        editAffordance
      />
      <span className="configHeaderSpacer" />
      {repoPath && (
        <>
          <button
            type="button"
            className="configRefreshBtn"
            title="Run yarn install in this app's folder"
            onClick={() => void tauri.openInTerminal(`cd ${shellQuote(repoPath)} && yarn install; exec $SHELL`)}
          >
            <Package size={13} /> Yarn install
          </button>
          <button
            type="button"
            className="configRefreshBtn"
            title="Open a terminal in this app's folder"
            onClick={() => void tauri.openInTerminal(`cd ${shellQuote(repoPath)} && exec $SHELL`)}
          >
            <SquareTerminal size={13} /> Terminal
          </button>
        </>
      )}
    </div>
  )
}
