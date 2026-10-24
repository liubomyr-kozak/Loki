import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../api'
import type { GroupAppIntent, GroupSelections } from '../../api'

export interface GroupSelectionsState {
  selections: GroupSelections
  loaded: boolean
}

const initialState: GroupSelectionsState = { selections: {}, loaded: false }

export const fetchGroupSelections = createAsyncThunk('groupSelections/fetch', async () => {
  return api.getGroupSelections()
})

export const setGroupIntent = createAsyncThunk(
  'groupSelections/setIntent',
  async (arg: { group: string; app: string; patch: GroupAppIntent }) => {
    const intent = await api.setGroupIntent(arg.group, arg.app, arg.patch)
    return { group: arg.group, app: arg.app, intent }
  },
)

export const clearGroupIntent = createAsyncThunk(
  'groupSelections/clearIntent',
  async (arg: { group: string; app: string }) => {
    await api.deleteGroupIntent(arg.group, arg.app)
    return arg
  },
)

export const renameGroupSelections = createAsyncThunk(
  'groupSelections/rename',
  async (arg: { from: string; to: string }) => {
    await api.renameGroupSelections(arg.from, arg.to)
    return arg
  },
)

const slice = createSlice({
  name: 'groupSelections',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGroupSelections.fulfilled, (state, action) => {
        state.selections = action.payload
        state.loaded = true
      })
      .addCase(setGroupIntent.fulfilled, (state, action) => {
        const { group, app, intent } = action.payload
        const groupMap = state.selections[group] ?? {}
        groupMap[app] = intent
        state.selections[group] = groupMap
      })
      .addCase(clearGroupIntent.fulfilled, (state, action) => {
        const { group, app } = action.payload
        const groupMap = state.selections[group]
        if (!groupMap) return
        delete groupMap[app]
        if (Object.keys(groupMap).length === 0) {
          delete state.selections[group]
        }
      })
      .addCase(renameGroupSelections.fulfilled, (state, action) => {
        const { from, to } = action.payload
        const fromMap = state.selections[from]
        if (!fromMap) return
        const toMap = state.selections[to] ?? {}
        state.selections[to] = { ...fromMap, ...toMap }
        delete state.selections[from]
      })
  },
})

export default slice.reducer
