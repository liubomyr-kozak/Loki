import type { AppDispatch, RootState } from './index'
import { startApp, stopApp, refreshAll } from './slices/appsSlice'
import { switchBranch, scriptsKey } from './slices/gitSlice'
import { setPendingExclusiveStart } from './slices/uiSlice'
import { ALL_ID } from '../lib/constants'
import { hasIntentDrift } from '../lib/grouping'
import type { GroupStartConflict } from '../lib/grouping'

// Shared by the row's own "start" action (useAppRow) and the bulk group-start
// button (GroupHeader) so both apply a group's branch/env intent through the
// exact same sequence: checkout (if the intent branch differs from the live
// one) then start, never persisting the launch env into the global per-app
// selection. Outside a group (groupId undefined) this collapses to a plain
// start with whatever the app's own selected env already is — unchanged from
// pre-group behaviour.
export async function applyGroupIntentAndStart(
  dispatch: AppDispatch,
  getState: () => RootState,
  groupId: string | undefined,
  appName: string,
  opts?: { allowInvalidIntent?: boolean },
): Promise<boolean> {
  // ALL_ID is a display-only pseudo-tag for the "All" section, never a
  // real group — treat it as "no group" so it can never write or read a
  // group-selections entry under the '__all__' key.
  if (groupId === ALL_ID) groupId = undefined

  const state = getState()
  const cfg = state.apps.config?.apps[appName]
  if (!cfg) return false

  const st = state.apps.apps[appName]
  const groupIntent = groupId !== undefined ? state.groupSelections.selections[groupId]?.[appName] : undefined
  const intentBranch = groupId !== undefined ? groupIntent?.branch : undefined
  const envs = state.git.scriptsByApp[scriptsKey(appName, intentBranch ?? '')]?.matched ?? []

  let selEnv: string | undefined
  if (groupId !== undefined && groupIntent?.environment !== undefined) {
    if (envs.includes(groupIntent.environment)) {
      selEnv = groupIntent.environment
    } else if (opts?.allowInvalidIntent) {
      selEnv = groupIntent.environment
    } else {
      return false
    }
  } else {
    const wantedEnv = st?.selectedEnvironment
    selEnv = wantedEnv && envs.includes(wantedEnv) ? wantedEnv : envs[0]
  }

  // Always dispatch when an intent branch is set — never gate on the cached
  // st?.branch (polling can leave it stale for up to POLL_MS). A checkout to
  // the branch already checked out is a safe no-op in gitFlowService.
  if (groupId !== undefined && intentBranch) {
    const r = await dispatch(switchBranch({ appName, branch: intentBranch })).unwrap().catch(() => null)
    if (!r || r.ok === false || r.conflict) return false
  }

  await dispatch(startApp({
    name: appName,
    environment: selEnv,
    persistSelection: groupId !== undefined ? false : undefined,
  })).unwrap().catch(() => {})
  return true
}

export function startApps(names: string[], groupId?: string) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    for (const appName of names) {
      await applyGroupIntentAndStart(dispatch, getState, groupId, appName)
    }
    await dispatch(refreshAll())
  }
}

export function stopApps(names: string[]) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    for (const appName of names) {
      const st = getState().apps.apps[appName]
      if (st?.process === 'running') {
        await dispatch(stopApp({ name: appName })).unwrap().catch(() => {})
      }
    }
    await dispatch(refreshAll())
  }
}

// All configured apps whose `groups` tag list includes groupId — the raw
// membership set that exclusivity/conflict checks are computed against.
// ALL_ID is a display bucket, never a real group (R0): collapses to "no
// members" so it can never accidentally participate in exclusivity.
export function groupMemberNames(state: RootState, groupId: string): string[] {
  if (groupId === ALL_ID) return []
  const config = state.apps.config
  if (!config) return []
  return Object.keys(config.apps).filter((n) => (config.apps[n]?.groups ?? []).includes(groupId))
}

// Running apps that (a) are NOT members of groupId and (b) belong to at
// least one REAL group — a label actually present in config.groupOrder, not
// just any string in an app's `groups` array. This is what makes exclusivity
// per-app rather than per-group (R1): a running app tagged with two groups
// only counts as "foreign" once, and a free/ungrouped app (no group in
// groupOrder) never counts at all, so it's never touched by a group switch.
export function foreignRunningNames(state: RootState, groupId: string): string[] {
  const config = state.apps.config
  if (!config) return []
  const realGroups = new Set(config.groupOrder ?? [])
  const members = new Set(groupMemberNames(state, groupId))
  return Object.keys(state.apps.apps).filter((n) => {
    if (members.has(n)) return false
    if (state.apps.apps[n]?.process !== 'running') return false
    const groups = config.apps[n]?.groups ?? []
    return groups.some((g) => realGroups.has(g))
  })
}

// Running MEMBERS of groupId whose live branch/environment disagrees with
// what the group's own stored intent wants for them — the exact set that
// must not be silently stopped-and-restarted or silently left alone. Reuses
// the same hasIntentDrift predicate as the per-row drift chip (useAppRow) so
// "is this app drifted" is defined in exactly one place.
export function groupIntentConflicts(state: RootState, groupId: string): GroupStartConflict[] {
  const config = state.apps.config
  if (!config) return []
  const conflicts: GroupStartConflict[] = []
  for (const app of groupMemberNames(state, groupId)) {
    const st = state.apps.apps[app]
    if (st?.process !== 'running') continue
    const intent = state.groupSelections.selections[groupId]?.[app]
    const check = {
      wantBranch: intent?.branch,
      liveBranch: st.branch,
      wantEnv: intent?.environment,
      liveEnv: st.runningEnvironment,
    }
    if (hasIntentDrift(check)) {
      conflicts.push({ app, label: config.apps[app]?.label ?? app, ...check })
    }
  }
  return conflicts
}

// The exclusivity-aware entry point for every "start a group" / "start one
// row inside a group section" action (GroupHeader's Start pill, GroupMenu's
// "Start group", and useAppRow's single-row start — R1/R2). Outside a real
// group it is a plain start (no exclusivity to speak of). Inside one, a
// first pass with no `resolution` stops here and parks the conflict list in
// uiSlice for GroupStartConflictDialog to resolve — nothing is stopped or
// started yet, so a later Cancel is a true no-op, never a partial action.
export function startGroupExclusive(arg: {
  groupId?: string
  names: string[]
  allowInvalidIntent?: boolean
  resolution?: 'restart' | 'skip'
}) {
  return async (dispatch: AppDispatch, getState: () => RootState) => {
    let { groupId } = arg
    const { names, allowInvalidIntent, resolution } = arg
    if (groupId === ALL_ID) groupId = undefined

    if (groupId === undefined) {
      await dispatch(startApps(names, groupId))
      return
    }

    const state = getState()
    const conflicts = groupIntentConflicts(state, groupId)

    if (!resolution && conflicts.length > 0) {
      dispatch(setPendingExclusiveStart({ groupId, names, allowInvalidIntent, conflicts }))
      return
    }

    const conflictApps = new Set(conflicts.map((c) => c.app))
    const foreign = foreignRunningNames(state, groupId)
    // 'restart' additionally reclaims the drifted members themselves so they
    // relaunch under the group's intent instead of staying on their old one.
    const toStop = resolution === 'restart' ? [...foreign, ...conflictApps] : foreign
    if (toStop.length > 0) await dispatch(stopApps(toStop))

    // 'restart' widens the start list to include drifted members that
    // weren't already in `names` (a single-row start can trigger a
    // group-wide restart of its rivals' drift); 'skip' narrows it so those
    // apps are left running untouched.
    const startNames = resolution === 'restart'
      ? [...new Set([...names, ...conflictApps])]
      : names.filter((n) => !conflictApps.has(n))

    for (const appName of startNames) {
      await applyGroupIntentAndStart(dispatch, getState, groupId, appName, { allowInvalidIntent })
    }
    await dispatch(refreshAll())
  }
}
