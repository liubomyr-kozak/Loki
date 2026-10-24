import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import { api } from '../../api'

export interface OrderState {
  order: string[]
}

const initialState: OrderState = { order: [] }

export const fetchOrder = createAsyncThunk('order/fetch', async () => {
  const r = await api.getOrder()
  return r.order
})

const slice = createSlice({
  name: 'order',
  initialState,
  reducers: {
    setOrder(state, action: PayloadAction<string[]>) {
      state.order = action.payload
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchOrder.fulfilled, (state, action) => {
      state.order = action.payload
    })
  },
})

export const { setOrder } = slice.actions
export default slice.reducer
