import { createSelector } from '@reduxjs/toolkit'
import type { RootState } from './index'
import type { FullConfig, AppStatus, InstanceRecord } from '../api'
import { effectiveOrder, sortByOrder, isRunning, expandRows, expandOrderWithInstances } from '../lib/grouping'
import { ALL_ID } from '../lib/constants'

const selectOrder = (s: RootState) => s.order.order
const selectConfig = (s: RootState) => s.apps.config
const selectApps = (s: RootState) => s.apps.apps
const selectFavorites = (s: RootState) => s.favorites.favorites
const selectFilterRunning = (s: RootState) => s.ui.filterRunning
const selectSearchQuery = (s: RootState) => s.ui.searchQuery
export const selectInstancesById = (s: RootState) => s.instances.byId

export const selectInstancesByApp = createSelector([selectInstancesById], (byId) => {
  const map: Record<string, InstanceRecord[]> = {}
  for (const rec of Object.values(byId)) {
    ;(map[rec.appName] ??= []).push(rec)
  }
  return map
})

export const selectEffectiveOrder = createSelector(
  [selectOrder, selectConfig, selectInstancesByApp],
  (order, config, instancesByApp) => expandOrderWithInstances(effectiveOrder(order, config), instancesByApp),
)

export const selectSortedAll = createSelector(
  [selectConfig, selectEffectiveOrder, selectFavorites],
  (config, effOrder, favorites) => {
    const sorted = sortByOrder(config ? Object.keys(config.apps) : [], effOrder)
    const favSet = new Set(favorites)
    const favs: string[] = []
    const rest: string[] = []
    for (const n of sorted) (favSet.has(n) ? favs : rest).push(n)
    return [...favs, ...rest]
  },
)

export const selectVisibleNames = createSelector(
  [selectSortedAll, selectApps, selectConfig, selectFilterRunning, selectSearchQuery],
  (sortedAll, apps, config, filterRunning, searchQuery) => {
    if (!config) return [] as string[]
    const filteredNames = filterRunning ? sortedAll.filter((n) => isRunning(apps[n])) : sortedAll
    const visibleNames = searchQuery
      ? filteredNames.filter((n) => config.apps[n].label.toLowerCase().includes(searchQuery.toLowerCase()))
      : filteredNames
    return visibleNames
  },
)

export const selectRunningCount = createSelector(
  [selectConfig, selectApps],
  (config, apps) => (config ? Object.keys(config.apps).filter((n) => isRunning(apps[n])).length : 0),
)

export const selectAppCount = createSelector(
  [selectConfig],
  (config) => (config ? Object.keys(config.apps).length : 0),
)

export const selectGroupSections = createSelector(
  [selectVisibleNames, selectConfig],
  (visibleNames, config): [string, string[]][] => {
    if (!config) return []
    // Order by the (already-reconciled by fetchConfig.fulfilled) groupOrder,
    // not selectAllGroups' raw first-seen scan — this is what lets drag
    // reordering and the FR-4/FR-11 reconciliation actually control render
    // order.
    return (config.groupOrder ?? [])
      .map((label): [string, string[]] => [label, visibleNames.filter((n) => (config.apps[n].groups ?? []).includes(label))])
      .filter(([, names]) => names.length > 0)
  },
)

export const selectListNameSet = createSelector(
  [selectConfig],
  (config) => {
    const set = new Set<string>()
    if (!config) return set
    for (const n of Object.keys(config.apps)) {
      if (config.apps[n].surface === 'list') set.add(n)
    }
    return set
  },
)

export const selectListNames = createSelector(
  [selectVisibleNames, selectListNameSet],
  (visibleNames, listNames) => visibleNames.filter((n) => listNames.has(n)),
)

// "All" mirrors the whole list-surface roster, deliberately including apps
// already shown in group sections above — it's a display bucket, never a
// group, so it never participates in group start/stop or group-selection
// intent.
export const selectAllMemberNames = createSelector(
  [selectSortedAll, selectListNameSet, selectInstancesByApp],
  (sortedAll, listNames, instancesByApp) => expandRows(sortedAll.filter((n) => listNames.has(n)), instancesByApp),
)

export const selectDockNames = createSelector(
  [selectVisibleNames, selectConfig],
  (visibleNames, config) => {
    if (!config) return [] as string[]
    return visibleNames.filter((n) => config.apps[n].surface === 'dock')
  },
)

function effectiveRepoPath(config: FullConfig, name: string): string | undefined {
  const cfg = config.apps[name]
  return cfg?.repoPath
}

// Factory (not a single shared selector): callers render one instance of this
// per app row, each with its own stable appName, so each row must get its own
// memoized selector via useMemo(makeSelectAppsSharingRepoPath, []) — a single
// shared instance would thrash its one-slot cache across different appNames
// every render and never actually memoize anything.
export function makeSelectAppsSharingRepoPath() {
  return createSelector(
    [selectConfig, (_: RootState, appName: string) => appName],
    (config, appName): string[] => {
      if (!config) return []
      const target = effectiveRepoPath(config, appName)
      if (!target) return []
      return Object.keys(config.apps).filter(
        (n) => n !== appName && effectiveRepoPath(config, n) === target,
      )
    },
  )
}

export interface GroupIntentResult {
  branch?: string
  // Raw (group, app) intent exactly as stored — undefined when this group has
  // never expressed an opinion for the app. Deliberately NOT collapsed with
  // the inherited value: an unset intent rendering as a concrete value was
  // exactly the "changing one row silently changes another" trap. Drift
  // computations must also compare against this, never against the inherited
  // value.
  rawEnvironment?: string
  // What an unset row inherits for display: the app's global selected
  // environment as reported by status. Callers must present it AS inherited
  // (chip/tone), never as if the group had chosen it.
  inheritedEnvironment?: string
  // 'global-selection' when the backend reports a global selected env;
  // 'first-script' when even that is absent and the row can only fall back to
  // the first matched script of whatever worktree/ref it is looking at.
  inheritedSource: 'global-selection' | 'first-script'
}

const selectGroupSelectionsMap = (s: RootState) => s.groupSelections.selections

// Factory (not a single shared selector): callers render one instance of this
// per (group, app) pair, each with its own stable args, so each caller must
// get its own memoized selector via useMemo(makeSelectGroupIntent, []) — a
// single shared instance would thrash its one-slot cache across different
// (groupId, appName) pairs every render and never actually memoize anything.
export function selectGroupIntent() {
  return createSelector(
    [
      selectGroupSelectionsMap,
      selectApps,
      (_: RootState, groupId: string | undefined, _appName: string) => groupId,
      (_: RootState, _groupId: string | undefined, appName: string) => appName,
    ],
    (groupSelections, apps, groupId, appName): GroupIntentResult => {
      // ALL_ID is a display-only pseudo-tag, never a real group — never
      // read a group-selections entry under the '__all__' key.
      const effectiveGroupId = groupId === ALL_ID ? undefined : groupId
      const groupIntent = effectiveGroupId !== undefined ? groupSelections[effectiveGroupId]?.[appName] : undefined
      const inheritedEnvironment = apps[appName]?.selectedEnvironment ?? undefined
      return {
        branch: groupIntent?.branch ?? undefined,
        rawEnvironment: groupIntent?.environment ?? undefined,
        inheritedEnvironment,
        inheritedSource: inheritedEnvironment !== undefined ? 'global-selection' : 'first-script',
      }
    },
  )
}

export interface SectionRowsCtx {
  config: FullConfig | null
  apps: Record<string, AppStatus>
  searchQuery: string
  filterRunning: boolean
  // Optional: only the All-section list can contain clone rowIds (per ADR
  // "Клони поза групами в MVP") — group sections never do, so their callers
  // don't need to pass this.
  instancesById?: Record<string, InstanceRecord>
}

export function makeSectionRows(ctx: SectionRowsCtx) {
  const { config, apps, searchQuery, filterRunning, instancesById = {} } = ctx
  const owner = (n: string) => instancesById[n]?.appName ?? n
  return (members: string[]): string[] => {
    if (!config) return []
    const filtered = filterRunning ? members.filter((n) => isRunning(apps[owner(n)])) : members
    return searchQuery
      ? filtered.filter((n) => config.apps[owner(n)].label.toLowerCase().includes(searchQuery.toLowerCase()))
      : filtered
  }
}
