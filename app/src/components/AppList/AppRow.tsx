import { ExternalLink, Star } from 'lucide-react'
import { refreshAll, startApp, stopApp } from '../../store/slices/appsSlice'
import { fetchDescriptors } from '../../store/slices/pluginsSlice'
import { fetchBranches, switchBranch, dropStash, dismissConflict, dismissCheckoutError } from '../../store/slices/gitSlice'
import { DROP_STASH_ITEM } from '../pickers/constants'
import { TerminalButton } from './TerminalButton'
import { AppRowStatus } from './AppRowStatus'
import { AppRowPickers } from './AppRowPickers'
import { AppRowActions } from './AppRowActions'
import { AppRowModals } from './AppRowModals'
import { useAppRow } from './useAppRow'
import * as tauri from '../../lib/tauri'
import type { AppRowProps } from './types'

export function AppRow({ name, groupId, sortableRef, sortableStyle, dragHandle }: AppRowProps) {
  const vm = useAppRow(name, groupId)

  return (
    <div
      className="row"
      ref={sortableRef}
      style={sortableStyle}
      onContextMenu={(e) => {
        e.preventDefault()
        vm.openContextMenu(vm.appName, e.clientX + 4, e.clientY, groupId, vm.isClone ? name : undefined)
      }}
    >
      <div className="rowMain">
        <AppRowStatus
          process={vm.st?.process}
          hasActiveStatus={vm.hasActiveStatus}
          effIcon={vm.effIcon}
          dragHandle={dragHandle}
        />
        <span
          className="label"
          style={vm.canOpenSite ? { cursor: 'pointer' } : undefined}
          onClick={() => vm.canOpenSite && tauri.openAppSite({ appUrl: vm.st?.appUrl, port: vm.localPort })}
        >
          {vm.displayLabel}
          {vm.canOpenSite && <ExternalLink className="siteIcon" size={12} />}
        </span>
        {(vm.running || vm.isBusy || vm.st?.sessionAlive) && vm.st?.session && (
          <TerminalButton name={vm.appName} />
        )}
        {vm.isFavorite && <Star className="starIndicator" size={12} fill="currentColor" />}
        {vm.isClone && <span className="cloneBadge">Clone</span>}
      </div>
      <div className="rowControls">
        <AppRowPickers
          selEnv={vm.selEnv ?? ''}
          envs={vm.envs}
          isBusy={vm.isBusy}
          onEnvSelect={(en) => vm.onSelectEnvironment(en)}
          branchValue={vm.branchValue}
          branchVisible={!!(vm.st?.branch || vm.branchInfo)}
          branchPickerOptions={vm.branchPickerOptions}
          badges={{ dirty: vm.st?.dirty, stashAvailable: vm.st?.hasStashForBranch, conflict: !!vm.conflict }}
          branchesLoading={vm.branchesLoading}
          branchesError={vm.branchesError}
          onBranchOpen={() => vm.dispatch(fetchBranches(vm.appName))}
          onBranchSelect={(v) => {
            if (v === DROP_STASH_ITEM) {
              vm.setPendingDropStash(true)
              return
            }
            vm.onSelectBranch(v)
          }}
          plugins={vm.plugins}
          descriptors={vm.descriptors}
          runningActions={vm.runningActions}
          name={vm.appName}
          driftSlot={groupId !== undefined ? { active: vm.hasDrift, branch: vm.driftBranch, env: vm.driftEnv } : undefined}
        />
        <AppRowActions
          isBusy={vm.isBusy}
          isStoppable={vm.isStoppable}
          port={vm.st?.port}
          restart={vm.hasDrift}
          onToggle={() => {
            // Clone rows bypass the group-intent start path even inside a
            // group section — group start knows nothing about instances and
            // would act on the ORIGINAL instead.
            if (groupId !== undefined && !vm.isClone) {
              vm.requestStart()
              return
            }
            const instanceId = vm.isClone ? name : undefined
            const p = vm.isStoppable
              ? vm.dispatch(stopApp({ name: vm.appName, instanceId }))
              : vm.dispatch(startApp({ name: vm.appName, environment: vm.selEnv || undefined, instanceId }))
            p.then(() => { vm.dispatch(refreshAll()); vm.dispatch(fetchDescriptors()) })
          }}
        />
      </div>
      <AppRowModals
        pluginErr={vm.pluginErr}
        err={vm.err}
        selEnv={vm.selEnv ?? ''}
        name={vm.appName}
        cfgLabel={vm.cfg.label}
        pendingBranch={vm.pendingBranch}
        onConfirmBranch={() => {
          vm.dispatch(switchBranch({ appName: vm.appName, branch: vm.pendingBranch!.branch }))
          vm.setPendingBranch(null)
        }}
        onCancelBranch={() => vm.setPendingBranch(null)}
        pendingDropStash={vm.pendingDropStash}
        branchInfo={vm.branchInfo}
        onConfirmDropStash={() => {
          vm.dispatch(dropStash({ appName: vm.appName, stashRef: vm.branchInfo!.stash!.stashRef }))
          vm.setPendingDropStash(false)
        }}
        onCancelDropStash={() => vm.setPendingDropStash(false)}
        conflict={vm.conflict}
        onDismissConflict={() => vm.dispatch(dismissConflict(vm.appName))}
        checkoutError={vm.checkoutError}
        onDismissCheckoutError={() => vm.dispatch(dismissCheckoutError(vm.appName))}
        pendingGroupStart={vm.pendingGroupStart}
        onConfirmGroupStart={vm.confirmGroupStart}
        onCancelGroupStart={vm.cancelGroupStart}
        pendingDriftConfirm={vm.pendingDriftConfirm}
        onRestartWithGroupSettings={vm.resolveDriftRestart}
        onKeepDrift={vm.resolveDriftKeep}
        onCancelDrift={vm.cancelDrift}
        pendingOrphanConflict={vm.pendingOrphanConflict}
        onStopOldProcess={() => vm.resolveOrphanConflict('stop-old')}
        onKeepOldProcess={() => vm.resolveOrphanConflict('keep-old')}
        onCancelOrphanConflict={vm.cancelOrphanConflict}
      />
    </div>
  )
}
