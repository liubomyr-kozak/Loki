import { createSlice, createAsyncThunk, isPending, isFulfilled, isRejected } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { api } from '../../api'
import type { FullConfig, AppStatus } from '../../api'
import * as tauri from '../../lib/tauri'
import { fetchSessions } from './sessionsSlice'
import { rejectionMessage } from '../thunkError'
import { reconcileGroupOrder, selectAllGroups } from '../../lib/grouping'

export interface AppsState {
  config: FullConfig | null
  configLoaded: boolean
  apps: Record<string, AppStatus>
  busy: Record<string, boolean>
  errors: Record<string, string>
  cfgMsg: string
  // seq-guard for fetchApps: many call sites (polling, focus, switchBranch,
  // start/stop, groupOps, refreshAll) can have overlapping requests in
  // flight. Track each request's dispatch order and only ever apply a
  // response that is newer than the last one actually applied, so a late
  // response to an older request can't roll back a fresher snapshot.
  fetchAppsSeq: number
  appliedFetchAppsSeq: number
  pendingFetchAppsSeq: Record<string, number>
}

const initialState: AppsState = {
  config: null,
  configLoaded: false,
  apps: {},
  busy: {},
  errors: {},
  cfgMsg: '',
  fetchAppsSeq: 0,
  appliedFetchAppsSeq: 0,
  pendingFetchAppsSeq: {},
}

export const fetchConfig = createAsyncThunk('apps/fetchConfig', () => api.getConfig())
export const fetchApps = createAsyncThunk('apps/fetchApps', () => api.getApps())

export const startApp = createAsyncThunk(
  'apps/startApp',
  (arg: { name: string; environment?: string; force?: boolean; persistSelection?: boolean; instanceId?: string; resolution?: 'stop-old' | 'keep-old' }) =>
    api.start(arg.name, arg.environment, arg.force, arg.persistSelection, arg.instanceId, arg.resolution),
)

export const stopApp = createAsyncThunk(
  'apps/stopApp',
  (arg: { name: string; force?: boolean; instanceId?: string }) => api.stop(arg.name, arg.force, arg.instanceId),
)

export const restartApp = createAsyncThunk(
  'apps/restartApp',
  (arg: { name: string; instanceId?: string }) => api.restart(arg.name, arg.instanceId),
)

// The row-state key for a start/stop/restart call: an instance's own id when
// given (a detached clone gets its own busy/status slot distinct from the
// original's), else the plain app name — unchanged from before instances
// existed.
const rowKey = (arg: { name: string; instanceId?: string }) => arg.instanceId ?? arg.name

export const setEnvironment = createAsyncThunk(
  'apps/setEnvironment',
  (arg: { name: string; environment: string }) => api.setEnvironment(arg.name, arg.environment),
)

export const reloadConfig = createAsyncThunk('apps/reloadConfig', async (_: void, { dispatch }) => {
  try {
    await api.reloadConfig()
    await Promise.all([dispatch(fetchConfig()), dispatch(fetchApps())])
    dispatch(setCfgMsg('Configuration reloaded.'))
  } catch (e) {
    dispatch(setCfgMsg(`Reload failed: ${(e as Error)?.message ?? e}`))
  }
})

export const openConfigInEditor = createAsyncThunk('apps/openConfigInEditor', async (_: void, { dispatch }) => {
  try {
    const { path } = await api.getConfigPath()
    await tauri.openConfigInEditor(path)
    dispatch(setCfgMsg('Opened in your editor — save the file, then Reload.'))
  } catch (e) {
    dispatch(setCfgMsg(`Could not open: ${(e as Error)?.message ?? e}`))
  }
})

export const refreshAll = createAsyncThunk('apps/refreshAll', async (_: void, { dispatch }) => {
  await Promise.all([dispatch(fetchApps()), dispatch(fetchSessions())])
})

const appOps = [startApp, stopApp, restartApp, setEnvironment] as const

const slice = createSlice({
  name: 'apps',
  initialState,
  reducers: {
    setCfgMsg(state, action: PayloadAction<string>) {
      state.cfgMsg = action.payload
    },
    setGroupOrder(state, action: PayloadAction<string[]>) {
      if (state.config) state.config.groupOrder = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchConfig.fulfilled, (state, action) => {
        // Build a NEW object here — never `state.config = action.payload`
        // followed by an in-place patch. Immer does not draft a value freshly
        // assigned into a draft, so mutating `state.config.groupOrder`
        // afterwards would write straight through to `action.payload` too,
        // making the persistence listener's diff against `action.payload`
        // always see "no change".
        state.config = {
          ...action.payload,
          groupOrder: reconcileGroupOrder(action.payload.groupOrder ?? [], selectAllGroups(action.payload)),
        }
        state.configLoaded = true
      })
      .addCase(fetchConfig.rejected, (state, action) => {
        state.cfgMsg = rejectionMessage(action, 'Failed to load configuration')
      })
      .addCase(fetchApps.pending, (state, action) => {
        state.fetchAppsSeq += 1
        state.pendingFetchAppsSeq[action.meta.requestId] = state.fetchAppsSeq
      })
      .addCase(fetchApps.fulfilled, (state, action) => {
        const seq = state.pendingFetchAppsSeq[action.meta.requestId]
        delete state.pendingFetchAppsSeq[action.meta.requestId]
        if (seq !== undefined && seq < state.appliedFetchAppsSeq) return
        if (seq !== undefined) state.appliedFetchAppsSeq = seq
        state.apps = action.payload
      })
      .addCase(fetchApps.rejected, (state, action) => {
        delete state.pendingFetchAppsSeq[action.meta.requestId]
      })
      .addMatcher(isPending(...appOps), (state, action) => {
        state.busy[rowKey(action.meta.arg)] = true
      })
      .addMatcher(isFulfilled(...appOps), (state, action) => {
        const key = rowKey(action.meta.arg)
        const st = action.payload
        state.busy[key] = false
        state.apps[key] = st
        state.errors[key] = ''
      })
      .addMatcher(isRejected(...appOps), (state, action) => {
        const key = rowKey(action.meta.arg)
        state.busy[key] = false
        state.errors[key] = rejectionMessage(action, 'Operation failed')
      })
  },
})

export const { setCfgMsg, setGroupOrder } = slice.actions
export default slice.reducer
