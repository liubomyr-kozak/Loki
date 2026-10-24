import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../api'
import type { InstanceRecord } from '../../api'

export interface InstancesState {
  byId: Record<string, InstanceRecord>
}

const initialState: InstancesState = { byId: {} }

export const fetchInstances = createAsyncThunk('instances/fetch', () => api.getInstances())

export const cloneApp = createAsyncThunk(
  'instances/clone',
  (arg: { appName: string; label?: string }) => api.createInstance(arg.appName, arg.label),
)

export const deleteInstance = createAsyncThunk('instances/delete', async (arg: { id: string }) => {
  await api.deleteInstance(arg.id)
  return arg.id
})

// `environment: null` clears the override back to "no override" (falls back
// to the app's shared selection) — distinct from omitting the field, which
// the PATCH route treats as a no-op rather than a clear.
export const setInstanceEnvOverride = createAsyncThunk(
  'instances/setEnvOverride',
  (arg: { id: string; environment: string | null }) => api.setInstanceEnvOverride(arg.id, arg.environment),
)

const slice = createSlice({
  name: 'instances',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchInstances.fulfilled, (state, action) => {
      state.byId = action.payload
    })
    builder.addCase(cloneApp.fulfilled, (state, action) => {
      state.byId[action.payload.id] = action.payload
    })
    builder.addCase(deleteInstance.fulfilled, (state, action) => {
      delete state.byId[action.payload]
    })
    builder.addCase(setInstanceEnvOverride.fulfilled, (state, action) => {
      state.byId[action.payload.id] = action.payload
    })
  },
})

export default slice.reducer
