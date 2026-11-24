import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { loadPersistedCheckout, persistCheckout } from '../features/checkout/checkout.persistence';
import { checkoutReducer } from '../features/checkout/checkout.slice';
import { productsReducer } from '../features/products/products.slice';

const rootReducer = combineReducers({ products: productsReducer, checkout: checkoutReducer });

export type RootState = ReturnType<typeof rootReducer>;

/**
 * Store único (Flux): las vistas despachan acciones, los reducers calculan el nuevo
 * estado y las vistas se re-renderizan. El checkout se rehidrata desde localStorage
 * y cada cambio se persiste (solo campos no sensibles).
 */
export const createAppStore = (preloadedState?: Partial<RootState>) => {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState: { checkout: loadPersistedCheckout(), ...preloadedState } as RootState,
  });
  let lastCheckout = store.getState().checkout;
  store.subscribe(() => {
    const { checkout } = store.getState();
    if (checkout !== lastCheckout) {
      lastCheckout = checkout;
      persistCheckout(checkout);
    }
  });
  return store;
};

export type AppStore = ReturnType<typeof createAppStore>;
export type AppDispatch = AppStore['dispatch'];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
