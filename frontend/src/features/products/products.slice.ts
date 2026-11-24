import { createSlice } from '@reduxjs/toolkit';
import { createAppAsyncThunk, toErrorMessage } from '../../app/thunk';
import { backendApi } from '../../shared/api/backend-api';
import { Product } from '../../shared/api/types';

type LoadStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface ProductsState {
  byId: Record<string, Product>;
  ids: string[];
  listStatus: LoadStatus;
  detailStatus: Record<string, LoadStatus>;
  error: string | null;
}

export const initialProductsState: ProductsState = {
  byId: {},
  ids: [],
  listStatus: 'idle',
  detailStatus: {},
  error: null,
};

export const fetchProducts = createAppAsyncThunk('products/fetchAll', async (_: void, { rejectWithValue }) => {
  try {
    return await backendApi.listProducts();
  } catch (error) {
    return rejectWithValue(toErrorMessage(error));
  }
});

/** Se usa al entrar a la página de producto: siempre trae el stock más reciente. */
export const fetchProduct = createAppAsyncThunk('products/fetchOne', async (id: string, { rejectWithValue }) => {
  try {
    return await backendApi.getProduct(id);
  } catch (error) {
    return rejectWithValue(toErrorMessage(error));
  }
});

const productsSlice = createSlice({
  name: 'products',
  initialState: initialProductsState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.listStatus = 'loading';
        state.error = null;
      })
      .addCase(fetchProducts.fulfilled, (state, { payload }) => {
        state.listStatus = 'succeeded';
        state.ids = payload.map((p) => p.id);
        payload.forEach((p) => {
          state.byId[p.id] = p;
        });
      })
      .addCase(fetchProducts.rejected, (state, { payload }) => {
        state.listStatus = 'failed';
        state.error = payload ?? null;
      })
      .addCase(fetchProduct.pending, (state, { meta }) => {
        state.detailStatus[meta.arg] = 'loading';
      })
      .addCase(fetchProduct.fulfilled, (state, { payload }) => {
        state.detailStatus[payload.id] = 'succeeded';
        state.byId[payload.id] = payload;
      })
      .addCase(fetchProduct.rejected, (state, { meta, payload }) => {
        state.detailStatus[meta.arg] = 'failed';
        state.error = payload ?? null;
      });
  },
});

export const productsReducer = productsSlice.reducer;
