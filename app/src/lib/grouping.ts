import type { FullConfig, AppStatus, InstanceRecord } from '../api'

export function effectiveOrder(order: string[], config: FullConfig | null): string[] {
  if (!config) return [...order]
  const allNames = Object.keys(config.apps)
  return [
    ...order.filter((n) => n in config.apps),
    ...allNames.filter((n) => !order.includes(n)),
  ]
}

function sortInstances(instances: InstanceRecord[]): InstanceRecord[] {
  return [...instances].sort((a, b) => {
    const ao = a.order ?? Infinity
    const bo = b.order ?? Infinity
    if (ao !== bo) return ao - bo
    return a.createdAt.localeCompare(b.createdAt)
  })
}

// Expand a flat list of appNames into rowIds — each name followed by its own
// clone instanceIds (if any). Apps with no instances pass through unchanged.
export function expandRows(names: string[], instancesByApp: Record<string, InstanceRecord[]>): string[] {
  const result: string[] = []
  for (const name of names) {
    result.push(name)
    const instances = instancesByApp[name]
    if (instances) {
      result.push(...sortInstances(instances).map((i) => i.id))
    }
  }
  return result
}

// Weave clone instanceIds into a persisted appName-only `order` array so an
// old flat order (pre-dating instances) reads back as "each app owns its
// default instance" — every clone is inserted right after its owning
// appName, and any clone whose owner wasn't in `order` at all is appended
// at the tail (mirrors effectiveOrder's own tail-append of unseen appNames).
export function expandOrderWithInstances(
  order: string[],
  instancesByApp: Record<string, InstanceRecord[]>
): string[] {
  const seen = new Set(order)
  const emittedOwners = new Set<string>()
  const result: string[] = []
  for (const entry of order) {
    const instances = instancesByApp[entry]
    if (instances && !emittedOwners.has(entry)) {
      result.push(entry)
      emittedOwners.add(entry)
      for (const inst of sortInstances(instances)) {
        if (!seen.has(inst.id)) {
          result.push(inst.id)
          seen.add(inst.id)
        }
      }
    } else {
      result.push(entry)
    }
  }
  for (const [appName, instances] of Object.entries(instancesByApp)) {
    if (emittedOwners.has(appName)) continue
    for (const inst of sortInstances(instances)) {
      if (!seen.has(inst.id)) {
        result.push(inst.id)
        seen.add(inst.id)
      }
    }
  }
  return result
}

export function sortByOrder(names: string[], effOrder: string[]): string[] {
  return [...names].sort((a, b) => {
    const ai = effOrder.indexOf(a)
    const bi = effOrder.indexOf(b)
    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
  })
}

export function selectAllGroups(config: FullConfig | null): string[] {
  if (!config) return []
  const seen = new Set<string>()
  const result: string[] = []
  for (const n of Object.keys(config.apps)) {
    for (const g of config.apps[n].groups ?? []) {
      if (!seen.has(g)) {
        seen.add(g)
        result.push(g)
      }
    }
  }
  return result
}

export function isRunning(st: AppStatus | undefined): boolean {
  return st?.process === 'running' || st?.process === 'port-conflict'
}

// Unshift any label present in `liveLabels` but missing from `order` to the
// front (index 0, in first-seen order among the new ones), and drop any
// label in `order` no longer present in `liveLabels`. Pure — callers decide
// when/whether to persist the result.
export function reconcileGroupOrder(order: string[], liveLabels: string[]): string[] {
  const liveSet = new Set(liveLabels)
  const kept = order.filter((label) => liveSet.has(label))
  const keptSet = new Set(kept)
  const newLabels = liveLabels.filter((label) => !keptSet.has(label))
  return [...newLabels, ...kept]
}

export function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

export interface DriftCheck {
  wantBranch?: string
  liveBranch?: string
  wantEnv?: string
  liveEnv?: string
}

// Single source of truth for "does what's running disagree with what's
// wanted" — used both by the per-row drift chip (useAppRow's hasDrift) and
// by the group-start conflict gate (groupOps.groupIntentConflicts). These
// used to be two independently-written copies of the same comparison; an
// unset want-value is never drift, it just means "whatever is live is fine".
export function hasIntentDrift({ wantBranch, liveBranch, wantEnv, liveEnv }: DriftCheck): boolean {
  return (
    (wantBranch !== undefined && wantBranch !== liveBranch) ||
    (wantEnv !== undefined && liveEnv !== undefined && wantEnv !== liveEnv)
  )
}

// One entry per group member that is currently running but disagrees with
// the group's stored branch/environment intent — surfaced by the exclusive
// group-start conflict dialog so a shared app never gets silently resolved.
export interface GroupStartConflict {
  app: string
  label: string
  wantBranch?: string
  liveBranch?: string
  wantEnv?: string
  liveEnv?: string
}
