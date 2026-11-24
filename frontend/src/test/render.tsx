import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactElement } from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { createAppStore, RootState } from '../app/store';

const LocationProbe = () => <span data-testid="location">{useLocation().pathname}</span>;

interface Options {
  route?: string;
  path?: string;
  preloadedState?: Partial<RootState>;
  advanceTimers?: (ms: number) => void;
}

/** Renderiza con store real (Redux) y router en memoria; expone la ruta actual para asertar navegación. */
export const renderWithProviders = (ui: ReactElement, options: Options = {}) => {
  const { route = '/', path = '/', preloadedState, advanceTimers } = options;
  const store = createAppStore(preloadedState);
  const user = userEvent.setup(advanceTimers ? { advanceTimers } : undefined);
  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </Provider>,
  );
  return { store, user, ...utils };
};
