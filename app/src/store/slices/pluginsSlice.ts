import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { api } from '../../api'
import type { MarketplacePlugin, PluginPreview, CatalogEntry, PluginDescriptor } from '../../api'
import { refreshAll } from './appsSlice'
import { rejectionMessage } from '../thunkError'

export interface PluginsState {
  list: MarketplacePlugin[]
  descriptors: Record<string, Record<string, PluginDescriptor>>
  runningActions: Record<string, boolean>
  invokeErrors: Record<string, string>
  catalog: CatalogEntry[]
  catalogLoading: boolean
  preview: PluginPreview | null
  previewSource: string
  installing: boolean
  error: string
}

const initialState: PluginsState = {
  list: [],
  descriptors: {},
  runningActions: {},
  invokeErrors: {},
  catalog: [],
  catalogLoading: false,
  preview: null,
  previewSource: '',
  installing: false,
  error: '',
}

export const fetchPlugins = createAsyncThunk('plugins/fetch', () => api.getPlugins())

export const fetchDescriptors = createAsyncThunk('plugins/fetchDescriptors', () => api.getPluginDescriptors())

export const installPlugin = createAsyncThunk('plugins/install', async (source: string, { dispatch }) => {
  const p = await api.installPlugin(source)
  await dispatch(fetchPlugins())
  return p
})

export const setPluginActivated = createAsyncThunk('plugins/setActivated', async (arg: { id: string; activated: boolean }, { dispatch }) => {
  const p = await api.setPluginActivated(arg.id, arg.activated)
  await dispatch(fetchPlugins())
  return p
})

export const setPluginEnabled = createAsyncThunk('plugins/setEnabled', async (arg: { id: string; enabled: boolean }, { dispatch }) => {
  const p = await api.setPluginEnabled(arg.id, arg.enabled)
  await dispatch(fetchPlugins())
  return p
})

export const removePlugin = createAsyncThunk('plugins/remove', async (id: string, { dispatch }) => {
  await api.removePlugin(id)
  await Promise.all([dispatch(fetchPlugins()), dispatch(fetchCatalog())])
})

export const previewPlugin = createAsyncThunk('plugins/preview', async (source: string) => {
  return api.previewPlugin(source)
})

export const fetchCatalog = createAsyncThunk('plugins/fetchCatalog', async () => {
  const r = await api.getCatalog()
  return r.entries
})

export const invokePlugin = createAsyncThunk(
  'plugins/invoke',
  async (arg: { pluginId: string; appName: string; input?: unknown }, { dispatch }) => {
    const r = await api.invokePlugin(arg.pluginId, arg.appName, arg.input ?? {})
    await Promise.all([dispatch(refreshAll()), dispatch(fetchDescriptors())])
    return { ...arg, result: r.result }
  }
)

const slice = createSlice({
  name: 'plugins',
  initialState,
  reducers: {
    closePreview(state) {
      state.preview = null
      state.previewSource = ''
    },
    showPluginDetails(state, action: PayloadAction<MarketplacePlugin>) {
      state.preview = { manifest: action.payload }
      state.previewSource = ''
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlugins.fulfilled, (state, action) => {
        state.list = action.payload.plugins
      })
      .addCase(fetchPlugins.rejected, (state, action) => {
        state.error = rejectionMessage(action, 'Plugins fetch failed')
      })
      .addCase(fetchDescriptors.fulfilled, (state, action) => {
        state.descriptors = action.payload
      })
      .addCase(fetchDescriptors.rejected, (state, action) => {
        state.error = rejectionMessage(action, 'Descriptors fetch failed')
      })
      .addCase(installPlugin.pending, (state) => {
        state.installing = true
        state.error = ''
      })
      .addCase(installPlugin.fulfilled, (state) => {
        state.installing = false
        state.preview = null
      })
      .addCase(installPlugin.rejected, (state, action) => {
        state.installing = false
        state.error = rejectionMessage(action, 'Install failed')
      })
      .addCase(previewPlugin.pending, (state) => {
        state.installing = true
        state.error = ''
      })
      .addCase(previewPlugin.fulfilled, (state, action) => {
        state.installing = false
        state.preview = action.payload
        state.previewSource = action.meta.arg
      })
      .addCase(previewPlugin.rejected, (state, action) => {
        state.installing = false
        state.error = rejectionMessage(action, 'Preview failed')
      })
      .addCase(fetchCatalog.pending, (state) => {
        state.catalogLoading = true
      })
      .addCase(fetchCatalog.fulfilled, (state, action) => {
        state.catalog = action.payload
        state.catalogLoading = false
      })
      .addCase(fetchCatalog.rejected, (state, action) => {
        state.catalogLoading = false
        state.error = rejectionMessage(action, 'Catalog fetch failed')
      })
      .addCase(invokePlugin.pending, (state, action) => {
        const key = `${action.meta.arg.pluginId}:${action.meta.arg.appName}`
        state.runningActions[key] = true
        delete state.invokeErrors[action.meta.arg.appName]
      })
      .addCase(invokePlugin.fulfilled, (state, action) => {
        const key = `${action.payload.pluginId}:${action.payload.appName}`
        state.runningActions[key] = false
        delete state.invokeErrors[action.payload.appName]
      })
      .addCase(invokePlugin.rejected, (state, action) => {
        const key = `${action.meta.arg.pluginId}:${action.meta.arg.appName}`
        state.runningActions[key] = false
        const message = rejectionMessage(action, 'Plugin invoke failed')
        state.error = message
        state.invokeErrors[action.meta.arg.appName] = message
      })
      .addCase(setPluginActivated.rejected, (state, action) => {
        state.error = rejectionMessage(action, 'Plugin operation failed')
      })
      .addCase(setPluginEnabled.rejected, (state, action) => {
        state.error = rejectionMessage(action, 'Plugin operation failed')
      })
      .addCase(removePlugin.rejected, (state, action) => {
        state.error = rejectionMessage(action, 'Plugin operation failed')
      })
  },
})

export const { closePreview, showPluginDetails } = slice.actions
export default slice.reducer
