import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../api'
import type { GitBranchesResponse } from '../../api'
import { refreshAll } from './appsSlice'
import { rejectionMessage } from '../thunkError'

export interface GitState {
  branchesByApp: Record<string, GitBranchesResponse>
  branchesLoading: Record<string, boolean>
  branchesError: Record<string, string | undefined>
  conflict: Record<string, { files: string[] } | undefined>
  checkoutError: Record<string, string | undefined>
  // Set on switchBranch.pending, cleared on fulfilled/rejected — lets rows
  // stay busy for the whole checkout even though switchBranch isn't in
  // appsSlice's appOps (it doesn't touch state.apps.busy at all).
  checkoutPending: Record<string, boolean>
  // Keyed by scriptsKey(appName, requestedRef), NOT by app name alone: rows of
  // one app shown in different groups may preview different intent branches at
  // the same time, and a single per-app slot made them overwrite each other in
  // an endless refetch loop. The requested ref is the key (not the resolved
  // ref in the response) because '' — "the current worktree" — resolves to the
  // live branch name server-side and would otherwise never satisfy its own
  // lookup. `ref` inside the entry is the server-resolved ref, kept for
  // display/debugging only.
  scriptsByApp: Record<string, { ref: string; matched: string[]; all: string[] } | undefined>
  // Keyed the same way as scriptsByApp: tracks requests currently in flight so
  // the fetchScripts `condition` below can dedupe concurrent calls for the
  // same (app, ref) slot without the component having to guard on
  // scriptsInfo === undefined (that guard fetched a slot exactly once ever and
  // never refreshed it, which is what let a re-visited branch show stale
  // envs).
  scriptsPending: Record<string, true | undefined>
}

const SCRIPTS_KEY_SEP = '\u0000'
export const scriptsKey = (appName: string, ref: string) => `${appName}\u0000${ref}`

const initialState: GitState = {
  branchesByApp: {},
  branchesLoading: {},
  branchesError: {},
  conflict: {},
  checkoutError: {},
  checkoutPending: {},
  scriptsByApp: {},
  scriptsPending: {},
}

export const fetchScripts = createAsyncThunk(
  'git/fetchScripts',
  (arg: { appName: string; ref: string }) =>
    api.getBranchScripts(arg.appName, arg.ref).then((r) => ({ appName: arg.appName, ...r })),
  {
    condition: (arg, { getState }) => {
      const state = getState() as { git: GitState }
      return !state.git.scriptsPending[scriptsKey(arg.appName, arg.ref)]
    },
  },
)

// Re-runs fetchScripts for every slot already in the cache. The row effect
// that first filled a slot only refires when its (app, ref) pair changes, so
// nothing else notices that the env list depends on config too: editing an
// app's environmentFilter in the Workspace window left the launcher showing
// the script list matched by the OLD regex until a branch switch or restart.
// Refetch rather than clear — an emptied slot would blank the picker until
// the response lands.
export const refreshScripts = createAsyncThunk(
  'git/refreshScripts',
  async (_: void, { getState, dispatch }) => {
    const state = getState() as { git: GitState }
    await Promise.all(
      Object.keys(state.git.scriptsByApp).map((key) => {
        const [appName, ref] = key.split(SCRIPTS_KEY_SEP)
        return dispatch(fetchScripts({ appName, ref }))
      }),
    )
  },
)

export const fetchBranches = createAsyncThunk(
  'git/fetchBranches',
  async (appName: string, { dispatch }) => {
    const r = await api.getGitBranches(appName)
    // ref '' = the current-worktree cache slot — the one every surface without
    // an explicit intent branch reads. r.current would land in a per-branch
    // slot nobody is guaranteed to look at.
    dispatch(fetchScripts({ appName, ref: '' }))
    return { appName, ...r }
  }
)

export const switchBranch = createAsyncThunk(
  'git/switchBranch',
  async (arg: { appName: string; branch: string }, { dispatch }) => {
    const r = await api.checkoutBranch(arg.appName, arg.branch)
    await dispatch(refreshAll())
    // The worktree just moved to arg.branch, so refresh the current-worktree
    // slot ('') that non-intent surfaces read; fetching under ref arg.branch
    // would leave their slot stale.
    dispatch(fetchScripts({ appName: arg.appName, ref: '' }))
    return { ...arg, ...r }
  }
)

export const dropStash = createAsyncThunk(
  'git/dropStash',
  async (arg: { appName: string; stashRef: string }, { dispatch }) => {
    const r = await api.dropStash(arg.appName, arg.stashRef)
    await dispatch(refreshAll())
    return { ...arg, ...r }
  }
)

const slice = createSlice({
  name: 'git',
  initialState,
  reducers: {
    dismissConflict(state, action: { payload: string }) {
      delete state.conflict[action.payload]
    },
    dismissCheckoutError(state, action: { payload: string }) {
      delete state.checkoutError[action.payload]
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.pending, (state, action) => {
        state.branchesLoading[action.meta.arg] = true
        delete state.branchesError[action.meta.arg]
      })
      .addCase(fetchBranches.fulfilled, (state, action) => {
        const { appName, ...rest } = action.payload
        state.branchesByApp[appName] = rest
        state.branchesLoading[appName] = false
        delete state.branchesError[appName]
      })
      .addCase(fetchBranches.rejected, (state, action) => {
        state.branchesLoading[action.meta.arg] = false
        state.branchesError[action.meta.arg] = rejectionMessage(action, 'Fetch branches failed')
      })
      .addCase(switchBranch.pending, (state, action) => {
        state.checkoutPending[action.meta.arg.appName] = true
      })
      .addCase(switchBranch.fulfilled, (state, action) => {
        const { appName, branch, ok, conflict, files, appliedStash, error, staleStash, warning } = action.payload
        delete state.checkoutPending[appName]
        if (ok === false) {
          // Clear any stale conflict banner first — otherwise AppRowModals'
          // `!conflict` guard keeps showing the OLD conflict instead of this
          // new checkoutError.
          delete state.conflict[appName]
          state.checkoutError[appName] = error || 'Branch switch failed'
          return
        }
        if (conflict) {
          state.conflict[appName] = { files: files ?? [] }
        } else {
          delete state.conflict[appName]
        }
        // Checkout itself succeeded (ok:true) but the recorded stash for this
        // branch turned out to be gone from `git stash list` (dropped
        // outside the app) — not a checkout failure, but still not silent:
        // reuse checkoutError as the message channel since AppRowModals
        // already renders it as a dismissable banner whenever set.
        if (staleStash && warning) {
          state.checkoutError[appName] = warning
        } else {
          delete state.checkoutError[appName]
        }
        if (state.branchesByApp[appName]) {
          state.branchesByApp[appName].current = branch
          if (appliedStash && !conflict) {
            delete state.branchesByApp[appName].stash
          }
        }
      })
      .addCase(switchBranch.rejected, (state, action) => {
        const appName = action.meta.arg.appName
        delete state.checkoutPending[appName]
        delete state.conflict[appName]
        state.checkoutError[appName] = rejectionMessage(action, 'Branch switch failed')
      })
      .addCase(dropStash.fulfilled, (state, action) => {
        const { appName, ok, error } = action.payload
        if (ok === false) {
          state.checkoutError[appName] = error || 'Drop stash failed'
          return
        }
        delete state.checkoutError[appName]
        if (state.branchesByApp[appName]) {
          delete state.branchesByApp[appName].stash
        }
      })
      .addCase(dropStash.rejected, (state, action) => {
        const appName = action.meta.arg.appName
        state.checkoutError[appName] = rejectionMessage(action, 'Drop stash failed')
      })
      .addCase(fetchScripts.pending, (state, action) => {
        state.scriptsPending[scriptsKey(action.meta.arg.appName, action.meta.arg.ref)] = true
      })
      .addCase(fetchScripts.fulfilled, (state, action) => {
        const { appName, ref, matched, scripts } = action.payload
        // Do NOT clear the existing slot first — a stale value must keep
        // rendering while this refetch was in flight so the picker never
        // flashes empty.
        state.scriptsByApp[scriptsKey(appName, action.meta.arg.ref)] = { ref, matched, all: scripts.map((s) => s.name) }
        delete state.scriptsPending[scriptsKey(appName, action.meta.arg.ref)]
      })
      .addCase(fetchScripts.rejected, (state, action) => {
        const { appName, ref } = action.meta.arg
        const key = scriptsKey(appName, ref)
        delete state.scriptsPending[key]
        // A failed first fetch used to leave no slot at all, which meant the
        // env picker was gone forever — refreshScripts only re-fetches slots
        // that already exist in the cache. Write an empty slot so a later
        // refreshScripts can pick it back up and retry.
        if (!state.scriptsByApp[key]) {
          state.scriptsByApp[key] = { ref, matched: [], all: [] }
        }
      })
  },
})

export const { dismissConflict, dismissCheckoutError } = slice.actions
export default slice.reducer
