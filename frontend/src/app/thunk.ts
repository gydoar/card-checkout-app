import { createAsyncThunk } from '@reduxjs/toolkit';
import { ApiError } from '../shared/api/http-client';
import type { AppDispatch, RootState } from './store';

/** createAsyncThunk tipado con el estado global y errores como string (mensaje para la UI). */
export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  rejectValue: string;
}>();

export const toErrorMessage = (error: unknown): string =>
  error instanceof ApiError ? error.message : 'Ocurrió un error inesperado. Intenta de nuevo.';
