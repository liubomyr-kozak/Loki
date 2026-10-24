import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { api } from '../../api'
import * as tauri from '../../lib/tauri'
import { setCfgMsg } from './appsSlice'

export interface DesktopState {
  restartPhase: 'idle' | 'building' | 'restarting' | 'failed'
}

const initialState: DesktopState = {
  restartPhase: 'idle',
}

const POLL_INTERVAL_MS = 500
const POLL_TIMEOUT_MS = 30_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Rebuilds the backend (`POST /api/dev/rebuild`), kills+respawns it via the
// `restart_backend` Tauri command, then polls until the new process answers
// before reloading the whole webview. Deliberately separate from
// appsSlice's `restartApp` (that one restarts a managed MFE app, not Loki
// itself).
export const restartLoki = createAsyncThunk('desktop/restartLoki', async (_: void, { dispatch }) => {
  dispatch(setCfgMsg('Rebuilding…'))
  try {
    await api.rebuildServer()
  } catch (e) {
    dispatch(setCfgMsg(`Build failed: ${(e as Error)?.message ?? e}`))
    throw e
  }

  dispatch(setRestartPhase('restarting'))
  dispatch(setCfgMsg('Restarting…'))
  try {
    await tauri.restartBackend()
  } catch (e) {
    dispatch(setCfgMsg(`Restart failed: ${(e as Error)?.message ?? e}`))
    throw e
  }

  const deadline = Date.now() + POLL_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      await api.getApps()
      window.location.reload()
      return
    } catch {
      // Backend not back up yet — keep polling until the deadline.
    }
    await sleep(POLL_INTERVAL_MS)
  }
  const message = 'Restart failed: backend did not come back within 30s'
  dispatch(setCfgMsg(message))
  throw new Error(message)
})

const slice = createSlice({
  name: 'desktop',
  initialState,
  reducers: {
    setRestartPhase(state, action: PayloadAction<DesktopState['restartPhase']>) {
      state.restartPhase = action.payload
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restartLoki.pending, (state) => {
        state.restartPhase = 'building'
      })
      .addCase(restartLoki.rejected, (state) => {
        state.restartPhase = 'failed'
      })
      // No `.fulfilled` handler: the success path ends in
      // `window.location.reload()`, which tears the page down before Redux
      // ever applies a fulfilled action.
  },
})

export const { setRestartPhase } = slice.actions
export default slice.reducer
