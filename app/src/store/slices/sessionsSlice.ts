import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import { api } from '../../api'
import type { SessionInfo } from '../../api'

export interface SessionsState {
  sessions: SessionInfo[]
}

const initialState: SessionsState = { sessions: [] }

export const fetchSessions = createAsyncThunk('sessions/fetch', () => api.getSessions())

const slice = createSlice({
  name: 'sessions',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder.addCase(fetchSessions.fulfilled, (state, action) => {
      state.sessions = action.payload
    })
  },
})

export default slice.reducer
