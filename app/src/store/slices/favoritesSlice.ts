import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { api } from '../../api'
import type { RootState } from '../index'

export interface FavoritesState {
  favorites: string[]
}

const initialState: FavoritesState = { favorites: [] }

export const fetchFavorites = createAsyncThunk('favorites/fetch', async () => {
  const r = await api.getFavorites()
  return r.favorites
})

export const toggleFavorite = createAsyncThunk(
  'favorites/toggle',
  (arg: { name: string }, { getState, dispatch }) => {
    const state = getState() as RootState
    const current = state.favorites.favorites
    const next = current.includes(arg.name)
      ? current.filter((f) => f !== arg.name)
      : [...current, arg.name]
    dispatch(setFavorites(next))
    api.setFavorites(next).catch(() => {})
  },
)

const slice = createSlice({
  name: 'favorites',
  initialState,
  reducers: {
    setFavorites(state, action: PayloadAction<string[]>) {
      state.favorites = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchFavorites.fulfilled, (state, action) => {
      state.favorites = action.payload
    })
  },
})

export const { setFavorites } = slice.actions
export default slice.reducer
