import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { startGroupExclusive } from '../../store/groupOps'
import { clearPendingExclusiveStart } from '../../store/slices/uiSlice'
import { GitCheckoutConfirm } from '../portals/GitCheckoutConfirm'

// Mounted once at app-list level (App.tsx), like the other global portals
// (GroupMenu, AppContextMenu) — the conflict can originate from three
// different entry points (a single row's start, a group header's Start
// pill, or the group menu's "Start group"), so the dialog itself can't live
// inside any one of them. Reuses GitCheckoutConfirm rather than forking a
// second confirm-dialog implementation: its Confirm/secondary/Cancel trio
// maps exactly onto Restart-with-group-settings / Keep-as-is / Cancel.
export function GroupStartConflictDialog() {
  const dispatch = useAppDispatch()
  const pending = useAppSelector((s) => s.ui.pendingExclusiveStart)

  if (!pending) return null

  // Same em-dash / middle-dot formatting as the per-row drift chip
  // (useAppRow's driftLabel), so "want vs live" reads the same way here as
  // it does inline on a row.
  const warnings = pending.conflicts.map(
    (c) => `${c.label} — want: ${c.wantBranch ?? '—'} · ${c.wantEnv ?? '—'}, live: ${c.liveBranch ?? '—'} · ${c.liveEnv ?? '—'}`,
  )

  // Cancel must precede any side effect (R: "nothing at all happens") — it
  // only clears the pending state, it never dispatches startGroupExclusive.
  const cancel = () => dispatch(clearPendingExclusiveStart())

  const resolve = (resolution: 'restart' | 'skip') => {
    dispatch(startGroupExclusive({
      groupId: pending.groupId,
      names: pending.names,
      allowInvalidIntent: pending.allowInvalidIntent,
      resolution,
    }))
    dispatch(clearPendingExclusiveStart())
  }

  return (
    <GitCheckoutConfirm
      variant="confirm"
      title="Some apps in this group are running with different settings"
      warnings={warnings}
      confirmLabel="Restart with group settings"
      secondaryLabel="Keep as-is"
      onConfirm={() => resolve('restart')}
      onSecondary={() => resolve('skip')}
      onCancel={cancel}
    />
  )
}
