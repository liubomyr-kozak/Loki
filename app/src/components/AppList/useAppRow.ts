import { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../store/hooks'
import { fetchScripts, switchBranch, scriptsKey } from '../../store/slices/gitSlice'
import { setEnvironment, startApp, stopApp, refreshAll, setCfgMsg } from '../../store/slices/appsSlice'
import { setInstanceEnvOverride } from '../../store/slices/instancesSlice'
import { fetchDescriptors } from '../../store/slices/pluginsSlice'
import { setGroupIntent } from '../../store/slices/groupSelectionsSlice'
import { makeSelectAppsSharingRepoPath, selectGroupIntent } from '../../store/selectors'
import { startGroupExclusive } from '../../store/groupOps'
import { resolveAppIcon } from '../../lib/appIcon'
import { isRunning, hasIntentDrift } from '../../lib/grouping'
import { decideLinkage } from '../../api'
import { useMenus } from '../MenusContext'
import { DROP_STASH_ITEM } from '../pickers/constants'

const RUNNING_WARNING = 'App is running; live dev server may crash or need restart after branch switch.'
const sharedRepoWarning = (names: string[]) =>
  `${names.length} other app(s) use this repository path and will be affected: ${names.join(', ')}. This app's rows in other groups will also follow this checkout and may show drift.`
const invalidIntentWarning = (env: string, fallback?: string) =>
  `Environment "${env}" is not available on the target branch; "${fallback ?? 'the first available script'}" would be launched instead.`

export function useAppRow(rowId: string, groupId?: string) {
  const dispatch = useAppDispatch()
  const { openContextMenu } = useMenus()

  // A clone row's rowId is its instanceId; the implicit default instance's
  // rowId is just the appName itself (per ADR "instanceId === appName").
  // Every shared-state lookup/dispatch below resolves through `appName`,
  // never the raw rowId — status/config/favorites/git/plugins/session are
  // all shared with the original (ADR "runtime-стан спільний по appName").
  const instanceRecord = useAppSelector((s) => s.instances.byId[rowId])
  const isClone = !!instanceRecord
  const appName = instanceRecord?.appName ?? rowId
  const name = appName

  const cfg = useAppSelector((s) => s.apps.config!.apps[name])
  // The original's status, and — only for a clone — the status the backend
  // reports under the instance's own id (populated only while the instance
  // is detached; see routes/apps.ts's bulk GET /api/apps). Which one this
  // row actually uses is decided below, once `isDetached` is known.
  const appStatus = useAppSelector((s) => s.apps.apps[name])
  const instanceStatus = useAppSelector((s) => (isClone ? s.apps.apps[rowId] : undefined))
  const busyByAppName = useAppSelector((s) => !!s.apps.busy[name])
  const busyByRowId = useAppSelector((s) => (isClone ? !!s.apps.busy[rowId] : false))
  const checkoutPending = useAppSelector((s) => !!s.git.checkoutPending[name])
  const err = useAppSelector((s) => s.apps.errors[name])
  const isFavorite = useAppSelector((s) => s.favorites.favorites.includes(name))
  const plugins = useAppSelector((s) => s.plugins.list)
  const descriptors = useAppSelector((s) => s.plugins.descriptors)
  const runningActions = useAppSelector((s) => s.plugins.runningActions)
  const pluginErr = useAppSelector((s) => s.plugins.invokeErrors[name])
  const branchInfo = useAppSelector((s) => s.git.branchesByApp[name])
  const branchesLoading = useAppSelector((s) => s.git.branchesLoading[name])
  const branchesError = useAppSelector((s) => s.git.branchesError[name])
  const conflict = useAppSelector((s) => s.git.conflict[name])
  const checkoutError = useAppSelector((s) => s.git.checkoutError[name])
  // Kept inside the hook so each row gets one stable memoized instance — do not
  // hoist to module scope, that would break reselect memoization across rows.
  const selectAppsSharingRepoPath = useMemo(makeSelectAppsSharingRepoPath, [])
  const sharingApps = useAppSelector((s) => selectAppsSharingRepoPath(s, name))
  // Same one-instance-per-row rule as above: this selector is keyed on
  // (groupId, name), so a shared instance would thrash across rows/groups.
  const selectIntent = useMemo(selectGroupIntent, [])
  const intent = useAppSelector((s) => selectIntent(s, groupId, name))

  const [pendingBranch, setPendingBranch] = useState<{ branch: string; warnings: string[] } | null>(null)
  const [pendingDropStash, setPendingDropStash] = useState(false)
  const [pendingGroupStart, setPendingGroupStart] = useState<{ warnings: string[] } | null>(null)
  const [pendingDriftConfirm, setPendingDriftConfirm] = useState<{ liveBranch: string; liveEnv?: string } | null>(null)
  // Orphan-process conflict (task 4/ADR §Фаза 2): unlike the above, this one
  // isn't opened by a click — it's DERIVED from the status the backend
  // already reports (`st.conflict`, surfaced both proactively on a poll and
  // in a start attempt's response), so it can appear the moment a poll
  // notices a leftover process, not only after the user clicks Start. Cancel
  // has nothing server-side to undo (same as the drift dialog's Cancel), so
  // it just remembers which conflict was dismissed — keyed on
  // `otherProcessKey`, which changes if a genuinely different conflict shows
  // up later — so the same one doesn't reopen on the next poll.
  const [dismissedOrphanKey, setDismissedOrphanKey] = useState<string | null>(null)

  // Intent branch is only meaningful inside a group section; outside one
  // (groupId undefined) it must stay undefined so every fallback below
  // collapses back to today's plain-branch behaviour.
  const intentBranch = groupId !== undefined ? intent.branch : undefined
  // Branch/git info is identical between appStatus and instanceStatus (both
  // resolve from the same shared repoPath) — safe to read off appStatus here
  // even before `isDetached` is known below.
  const liveBranch = appStatus?.branch ?? branchInfo?.current ?? ''
  const branchValue = groupId !== undefined ? (intentBranch ?? liveBranch) : liveBranch

  // Cache slot: ref '' = the current worktree. An ungrouped row always reads
  // that slot; a grouped row reads its intent branch's slot when one is set,
  // otherwise the worktree slot too. Per-(app, ref) keying means two rows of
  // one app previewing different branches each own their slot instead of
  // overwriting a single per-app entry in an endless refetch loop.
  const scriptsRef = groupId !== undefined ? (intentBranch ?? '') : ''
  const scriptsInfo = useAppSelector((s) => s.git.scriptsByApp[scriptsKey(name, scriptsRef)])
  // De-duplication of in-flight requests now lives in the fetchScripts thunk's
  // `condition` (keyed by scriptsKey), not here — so this effect can simply
  // refire whenever (name, scriptsRef) changes, including a return to a
  // previously-visited ref, instead of fetching each slot exactly once ever.
  useEffect(() => {
    dispatch(fetchScripts({ appName: name, ref: scriptsRef }))
  }, [name, scriptsRef, dispatch])

  const envs = scriptsInfo?.matched ?? []

  // The ONE shared linked/detached decision (backend/process/linkage.ts),
  // called here exactly the same way the backend calls it — never
  // re-derived as separate row-level yes/no logic. `instanceEnvironment`
  // mirrors the backend's own resolution: the override clamped to this
  // row's available scripts when set, else the app's own resolved env
  // (which always decides "linked").
  const instanceEnvironment = isClone
    ? (instanceRecord!.envOverride !== undefined
      ? (envs.includes(instanceRecord!.envOverride) ? instanceRecord!.envOverride : envs[0])
      : appStatus?.selectedEnvironment)
    : undefined
  const linkage = decideLinkage({
    appName,
    instanceId: instanceRecord?.id,
    appEnvironment: appStatus?.selectedEnvironment,
    instanceEnvironment,
  })
  const isDetached = isClone && linkage.mode === 'detached'

  // A detached clone shows its OWN live runtime state; a linked clone (or
  // the implicit default row) mirrors the original's — exactly phase 1's
  // behaviour, now decided instead of assumed. Falls back to appStatus if
  // the instance's own status hasn't loaded yet, so the row never blanks.
  const st = isDetached ? (instanceStatus ?? appStatus) : appStatus
  const isBusy = (isDetached ? busyByRowId : busyByAppName) || checkoutPending

  const pendingOrphanConflict = st?.conflict && st.conflict.otherProcessKey !== dismissedOrphanKey
    ? st.conflict
    : null

  const rawIntentEnv = groupId !== undefined ? intent.rawEnvironment : undefined
  // Inherited display value for a grouped row with no intent of its own: the
  // app's global selection when it exists in this row's script list, else the
  // first matched script. The source label follows what was actually used.
  const inheritedValid = intent.inheritedEnvironment !== undefined && envs.includes(intent.inheritedEnvironment)
  const inheritedEnv = inheritedValid ? intent.inheritedEnvironment : envs[0]
  const inheritedSource: 'global-selection' | 'first-script' = inheritedValid ? 'global-selection' : 'first-script'
  // A set intent renders as itself even when the target branch does not have
  // it — flagged invalid instead of silently clamping to envs[0], so what the
  // row shows is always what the row stores.
  const intentInvalid = rawIntentEnv !== undefined && envs.length > 0 && !envs.includes(rawIntentEnv)
  const envInherited = groupId !== undefined && rawIntentEnv === undefined
  const selEnv = groupId !== undefined
    ? (rawIntentEnv ?? inheritedEnv)
    : (st?.selectedEnvironment && envs.includes(st.selectedEnvironment) ? st.selectedEnvironment : envs[0])
  const running = isRunning(st)
  const isStoppable = st?.process === 'running'
  const hasActiveStatus = running || st?.process === 'unhealthy'
  const localPort = st?.port
  const siteUrl = st?.appUrl?.trim()
  const canOpenSite = !!(siteUrl || localPort)

  const effIcon = resolveAppIcon(cfg.icon)

  const canDropStash = !!branchInfo?.stash
  const branchOptions = branchInfo?.branches ?? []
  const branchPickerOptions = canDropStash ? [...branchOptions, DROP_STASH_ITEM] : branchOptions

  // Drift = this row is running with a branch/env other than the group it's
  // shown under currently wants. Compared against the raw intent (not the
  // picker's envs[0]/live-branch fallbacks) — an unset intent never counts as
  // drift, it just means "whatever is live is fine". Shares its predicate
  // (hasIntentDrift) with groupOps.groupIntentConflicts — the same rule must
  // not be written twice.
  const hasDrift = groupId !== undefined && running && hasIntentDrift({
    wantBranch: intentBranch,
    liveBranch: st?.branch,
    wantEnv: intent.rawEnvironment,
    liveEnv: st?.runningEnvironment,
  })
  const driftLabel = hasDrift ? `live: ${st?.branch ?? '—'} · ${st?.runningEnvironment ?? '—'}` : ''
  const driftBranch = st?.branch ?? '—'
  const driftEnv = st?.runningEnvironment ?? '—'

  const requestBranchSwitch = (branch: string) => {
    const warnings: string[] = []
    if (isStoppable) warnings.push(RUNNING_WARNING)
    if (sharingApps.length > 0) warnings.push(sharedRepoWarning(sharingApps))
    if (warnings.length > 0) {
      setPendingBranch({ branch, warnings })
    } else {
      dispatch(switchBranch({ appName: name, branch }))
    }
  }

  const onSelectEnvironment = (env: string) => {
    // Clone rows come FIRST: a clone rendered inside a group section is
    // display-only there — routing it through group intent would write the
    // ORIGINAL's intent and change the original's env.
    if (isClone) {
      // Phase 2: a clone's picker always writes to ITS OWN override, never
      // to the app's shared selection (replaces phase 1's "clone picker
      // writes the shared selection").
      dispatch(setInstanceEnvOverride({ id: rowId, environment: env }))
      // Evaluated against the PRE-change linked/detached state: while still
      // linked, the process is shared, so changing the environment here
      // restarts it for both rows — same notice as phase 1. Once detached,
      // the clone has its own process and the notice no longer applies.
      if (!isDetached) dispatch(setCfgMsg('Shared process with the original — changing the environment here restarts it too.'))
    } else if (groupId !== undefined) {
      dispatch(setGroupIntent({ group: groupId, app: name, patch: { environment: env } }))
    } else {
      dispatch(setEnvironment({ name: appName, environment: env }))
    }
  }

  const onSelectBranch = (branch: string) => {
    // Same ordering rule as onSelectEnvironment: a clone row inside a group
    // section must not write the ORIGINAL's group intent. The repo is shared
    // (one working tree), so a clone's branch pick goes straight through the
    // direct-checkout path with its usual shared-repo warnings.
    if (groupId !== undefined && !isClone) {
      // Intent only — no checkout until the group's row is started.
      dispatch(setGroupIntent({ group: groupId, app: name, patch: { branch } }))
      return
    }
    requestBranchSwitch(branch)
  }

  // Routed through startGroupExclusive (not applyGroupIntentAndStart
  // directly) so a single-row start inside a group section still enforces
  // R2: it stops the group's foreign rivals (per-app exclusivity) and, if
  // any of this row's group-mates are running with drifted intent, defers to
  // the same conflict dialog a full group-start would — starting only this
  // one app either way.
  const runGroupStart = (allowInvalidIntent = false) => {
    dispatch(startGroupExclusive({ groupId, names: [name], allowInvalidIntent })).then(() => {
      dispatch(refreshAll())
      dispatch(fetchDescriptors())
    })
  }

  const proceedGroupStart = () => {
    const warnings: string[] = []
    // A set-but-invalid intent never launches silently: the same confirm
    // dialog that guards checkouts spells out what would actually run.
    if (intentInvalid && rawIntentEnv !== undefined) warnings.push(invalidIntentWarning(rawIntentEnv, envs[0]))
    const needsCheckout = !!intentBranch && intentBranch !== (st?.branch ?? '')
    if (needsCheckout) {
      if (isStoppable) warnings.push(RUNNING_WARNING)
      if (sharingApps.length > 0) warnings.push(sharedRepoWarning(sharingApps))
    }
    if (warnings.length > 0) {
      setPendingGroupStart({ warnings })
      return
    }
    runGroupStart()
  }

  const confirmGroupStart = () => {
    setPendingGroupStart(null)
    runGroupStart(true)
  }
  const cancelGroupStart = () => setPendingGroupStart(null)

  // Entry point for the row's primary action while inside a group section
  // (Steps C+E): not running -> apply intent then start; running in step
  // with the group -> plain stop; running with drift -> ask before clobbering.
  const requestStart = () => {
    if (isStoppable) {
      if (hasDrift) {
        setPendingDriftConfirm({ liveBranch: st?.branch ?? '', liveEnv: st?.runningEnvironment })
      } else {
        dispatch(stopApp({ name })).then(() => { dispatch(refreshAll()); dispatch(fetchDescriptors()) })
      }
      return
    }
    proceedGroupStart()
  }

  const resolveDriftRestart = async () => {
    setPendingDriftConfirm(null)
    if (isStoppable) {
      await dispatch(stopApp({ name })).unwrap().catch(() => {})
    }
    proceedGroupStart()
  }
  const resolveDriftKeep = () => setPendingDriftConfirm(null)
  const cancelDrift = () => setPendingDriftConfirm(null)

  // Resolves the orphan-process conflict (task 4) through the SAME
  // start call the row's own toggle already makes — `resolution` just tells
  // the backend how to handle the leftover process it already told us
  // about, it isn't a second/different action.
  const resolveOrphanConflict = (resolution: 'stop-old' | 'keep-old') => {
    dispatch(startApp({
      name: appName,
      environment: selEnv || undefined,
      instanceId: instanceRecord?.id,
      resolution,
    })).then(() => { dispatch(refreshAll()); dispatch(fetchDescriptors()) })
  }
  const cancelOrphanConflict = () => {
    if (pendingOrphanConflict) setDismissedOrphanKey(pendingOrphanConflict.otherProcessKey)
  }

  return {
    dispatch,
    openContextMenu,
    groupId,
    appName,
    isClone,
    isDetached,
    instanceId: instanceRecord?.id,
    displayLabel: instanceRecord?.label ?? cfg.label,
    cfg,
    st,
    isBusy,
    err,
    isFavorite,
    plugins,
    descriptors,
    runningActions,
    pluginErr,
    branchInfo,
    branchesLoading,
    branchesError,
    conflict,
    checkoutError,
    pendingBranch,
    setPendingBranch,
    pendingDropStash,
    setPendingDropStash,
    envs,
    selEnv,
    running,
    isStoppable,
    hasActiveStatus,
    localPort,
    siteUrl,
    canOpenSite,
    effIcon,
    canDropStash,
    branchOptions,
    branchPickerOptions,
    requestBranchSwitch,
    branchValue,
    onSelectEnvironment,
    onSelectBranch,
    hasDrift,
    driftLabel,
    driftBranch,
    driftEnv,
    requestStart,
    pendingGroupStart,
    confirmGroupStart,
    cancelGroupStart,
    pendingDriftConfirm,
    resolveDriftRestart,
    resolveDriftKeep,
    cancelDrift,
    pendingOrphanConflict,
    resolveOrphanConflict,
    cancelOrphanConflict,
  }
}

export type AppRowVM = ReturnType<typeof useAppRow>
