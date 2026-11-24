import { createAppStore } from '../../app/store';
import { productFixture } from '../../test/fixtures';
import { mockFetch, route } from '../../test/mock-fetch';
import { fetchProduct, fetchProducts } from './products.slice';

describe('products slice', () => {
  it('carga el catálogo normalizado', async () => {
    mockFetch([route('GET', /products$/, { body: { data: [productFixture()] } })]);
    const store = createAppStore();
    const pending = store.dispatch(fetchProducts());
    expect(store.getState().products.listStatus).toBe('loading');
    await pending;
    expect(store.getState().products).toMatchObject({ listStatus: 'succeeded', ids: [productFixture().id] });
  });

  it('registra errores de catálogo y de detalle', async () => {
    mockFetch([route('GET', /products/, { status: 500, body: { error: 'INTERNAL_ERROR', message: 'Falla' } })]);
    const store = createAppStore();
    await store.dispatch(fetchProducts());
    expect(store.getState().products).toMatchObject({ listStatus: 'failed', error: 'Falla' });
    await store.dispatch(fetchProduct('x'));
    expect(store.getState().products.detailStatus.x).toBe('failed');
  });

  it('actualiza un producto (stock) individualmente', async () => {
    mockFetch([route('GET', /products\/.+/, { body: productFixture({ stock: 1 }) })]);
    const store = createAppStore();
    const pending = store.dispatch(fetchProduct(productFixture().id));
    expect(store.getState().products.detailStatus[productFixture().id]).toBe('loading');
    await pending;
    expect(store.getState().products.byId[productFixture().id].stock).toBe(1);
  });
});
