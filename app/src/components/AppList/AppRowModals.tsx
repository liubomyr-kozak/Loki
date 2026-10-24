import { GitCheckoutConfirm } from '../portals/GitCheckoutConfirm'
import { RowError } from './RowError'
import type { GitBranchesResponse, ProcessConflict } from '../../api'

export interface AppRowModalsProps {
  pluginErr?: string
  err?: string
  selEnv: string
  name: string
  cfgLabel: string
  pendingBranch: { branch: string; warnings: string[] } | null
  onConfirmBranch: () => void
  onCancelBranch: () => void
  pendingDropStash: boolean
  branchInfo?: GitBranchesResponse
  onConfirmDropStash: () => void
  onCancelDropStash: () => void
  conflict?: { files: string[] }
  onDismissConflict: () => void
  checkoutError?: string
  onDismissCheckoutError: () => void
  pendingGroupStart?: { warnings: string[] } | null
  onConfirmGroupStart?: () => void
  onCancelGroupStart?: () => void
  pendingDriftConfirm?: { liveBranch: string; liveEnv?: string } | null
  onRestartWithGroupSettings?: () => void
  onKeepDrift?: () => void
  onCancelDrift?: () => void
  pendingOrphanConflict?: ProcessConflict | null
  onStopOldProcess?: () => void
  onKeepOldProcess?: () => void
  onCancelOrphanConflict?: () => void
}

export function AppRowModals({
  pluginErr, err, selEnv, name, cfgLabel,
  pendingBranch, onConfirmBranch, onCancelBranch,
  pendingDropStash, branchInfo, onConfirmDropStash, onCancelDropStash,
  conflict, onDismissConflict,
  checkoutError, onDismissCheckoutError,
  pendingGroupStart, onConfirmGroupStart, onCancelGroupStart,
  pendingDriftConfirm, onRestartWithGroupSettings, onKeepDrift, onCancelDrift,
  pendingOrphanConflict, onStopOldProcess, onKeepOldProcess, onCancelOrphanConflict,
}: AppRowModalsProps) {
  return (
    <>
      {!!pluginErr && <div className="cfgStatus">{pluginErr}</div>}
      {err && <RowError name={name} error={err} selEnv={selEnv} />}
      {pendingBranch && (
        <GitCheckoutConfirm
          variant="confirm"
          title={`Switch ${cfgLabel} to "${pendingBranch.branch}"?`}
          warnings={pendingBranch.warnings}
          onConfirm={onConfirmBranch}
          onCancel={onCancelBranch}
        />
      )}
      {pendingDropStash && branchInfo?.stash && (
        <GitCheckoutConfirm
          variant="confirm"
          title={`Drop stash on ${branchInfo.stash.tag || branchInfo.current}?`}
          warnings={['This cannot be undone.']}
          onConfirm={onConfirmDropStash}
          onCancel={onCancelDropStash}
        />
      )}
      {conflict && (
        <GitCheckoutConfirm
          variant="conflict"
          title="Unresolved conflict"
          files={conflict.files}
          onCancel={onDismissConflict}
        />
      )}
      {!conflict && checkoutError && (
        <GitCheckoutConfirm
          variant="conflict"
          title="Branch switch failed"
          message={checkoutError}
          onCancel={onDismissCheckoutError}
        />
      )}
      {pendingGroupStart && (
        <GitCheckoutConfirm
          variant="confirm"
          title={`Start ${cfgLabel} with this group's branch/environment?`}
          warnings={pendingGroupStart.warnings}
          onConfirm={onConfirmGroupStart}
          onCancel={onCancelGroupStart!}
        />
      )}
      {pendingDriftConfirm && (
        <GitCheckoutConfirm
          variant="confirm"
          title={`${cfgLabel} is running with different settings`}
          warnings={[`live: ${pendingDriftConfirm.liveBranch || '—'} · ${pendingDriftConfirm.liveEnv || '—'}`]}
          confirmLabel="Restart with this group's settings"
          secondaryLabel="Keep as-is"
          onSecondary={onKeepDrift}
          onConfirm={onRestartWithGroupSettings}
          onCancel={onCancelDrift!}
        />
      )}
      {pendingOrphanConflict && (
        // Same confirm/keep/cancel affordance as the group-intent drift
        // dialog above, for a different domain: a live process is still
        // registered under this instance's OTHER identity (its linked/
        // detached status just changed).
        <GitCheckoutConfirm
          variant="confirm"
          title={`${cfgLabel} still has a process running under its previous identity`}
          warnings={[`live: ${pendingOrphanConflict.otherProcessKey}`]}
          confirmLabel="Stop the old process"
          secondaryLabel="Keep it running"
          onSecondary={onKeepOldProcess}
          onConfirm={onStopOldProcess}
          onCancel={onCancelOrphanConflict!}
        />
      )}
    </>
  )
}
