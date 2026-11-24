import { screen, waitFor } from '@testing-library/react';
import { configFixture, productFixture } from '../../test/fixtures';
import { mockFetch, route } from '../../test/mock-fetch';
import { renderWithProviders } from '../../test/render';
import { CatalogPage } from './CatalogPage';
import { ProductPage } from './ProductPage';
import { StockBadge } from './StockBadge';

const product = productFixture();

describe('CatalogPage', () => {
  it('muestra skeletons mientras carga y luego los productos con stock', async () => {
    mockFetch([route('GET', /products$/, { body: { data: [product, productFixture({ id: 'b', name: 'Cumbre', stock: 0 })] } })]);
    renderWithProviders(<CatalogPage />);
    expect(screen.getByRole('region', { name: 'Productos' })).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('heading', { name: 'Aire Runner' })).toBeInTheDocument();
    expect(screen.getByText('5 disponibles')).toBeInTheDocument();
    expect(screen.getByText('Agotado')).toBeInTheDocument();
    // Las dos primeras imágenes cargan de inmediato (above the fold), el resto diferido
    expect(screen.getByAltText('Aire Runner')).toHaveAttribute('loading', 'eager');
  });

  it('permite reintentar si falla', async () => {
    const fetchMock = mockFetch([route('GET', /products$/, { status: 500, body: { error: 'X', message: 'Caído' } })]);
    const { user } = renderWithProviders(<CatalogPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Caído');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('StockBadge', () => {
  it.each([
    [0, 'Agotado'],
    [1, '¡Última unidad!'],
    [3, '¡Últimas 3 unidades!'],
    [9, '9 disponibles'],
  ])('stock %i -> %s', (stock, text) => {
    renderWithProviders(<StockBadge stock={stock} />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('ProductPage', () => {
  const renderPage = () =>
    renderWithProviders(<ProductPage />, { route: `/products/${product.id}`, path: '/products/:productId' });

  it('muestra el detalle, limita la cantidad al máximo y abre el modal de pago', async () => {
    mockFetch([
      route('GET', /products\//, { body: productFixture({ maxUnitsPerOrder: 2 }) }),
      route('GET', /checkout\/config/, { body: configFixture }),
    ]);
    const { user, store } = renderPage();
    expect(await screen.findByRole('heading', { name: 'Aire Runner' })).toBeInTheDocument();

    const increase = screen.getByRole('button', { name: 'Aumentar cantidad' });
    await user.click(increase);
    expect(screen.getByLabelText('Cantidad seleccionada')).toHaveTextContent('2');
    expect(increase).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Disminuir cantidad' }));
    await user.click(increase);

    await user.click(screen.getByRole('button', { name: 'Pagar con tarjeta de crédito' }));
    expect(await screen.findByRole('dialog', { name: 'Pagar con tarjeta' })).toBeInTheDocument();
    expect(store.getState().checkout).toMatchObject({ step: 'DETAILS', quantity: 2 });
    await waitFor(() => expect(store.getState().checkout.config).not.toBeNull());
  });

  it('producto agotado: no permite pagar', async () => {
    mockFetch([route('GET', /products\//, { body: productFixture({ stock: 0, maxUnitsPerOrder: 0 }) })]);
    renderPage();
    expect(await screen.findByRole('button', { name: 'Agotado' })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'Cantidad' })).not.toBeInTheDocument();
  });

  it('producto inexistente: mensaje y enlace al catálogo', async () => {
    mockFetch([route('GET', /products\//, { status: 404, body: { error: 'PRODUCT_NOT_FOUND', message: 'El producto no existe' } })]);
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('El producto no existe');
    expect(screen.getByRole('link', { name: 'Ver el catálogo' })).toBeInTheDocument();
  });
});
