import { useEffect } from 'react';
import { Link, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { PaymentStatusPage } from '../features/checkout/PaymentStatusPage';
import { CatalogPage } from '../features/products/CatalogPage';
import { ProductPage } from '../features/products/ProductPage';
import { Header } from '../shared/ui/Header';
import { useAppSelector } from './store';

/**
 * Al recargar, lleva al usuario a donde iba según el estado persistido:
 *   - pago enviado      -> /checkout/:id (retoma el polling)
 *   - checkout abierto  -> /products/:id (reabre el modal o el resumen)
 */
const CheckoutResumer = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { step, productId, transaction } = useAppSelector((state) => state.checkout);

  useEffect(() => {
    if (transaction && (step === 'PROCESSING' || step === 'RESULT')) {
      const target = `/checkout/${transaction.id}`;
      if (pathname !== target) navigate(target, { replace: true });
    } else if (productId && step !== 'IDLE') {
      const target = `/products/${productId}`;
      if (pathname !== target) navigate(target, { replace: true });
    }
    // Solo al montar: después, la navegación la deciden las acciones del usuario
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

const NotFound = () => (
  <main style={{ padding: 'var(--space-6) var(--space-4)', textAlign: 'center' }}>
    <h1>Página no encontrada</h1>
    <p>
      <Link to="/">Volver a la tienda</Link>
    </p>
  </main>
);

export const App = () => (
  <>
    <a href="#contenido" className="visually-hidden">
      Saltar al contenido
    </a>
    <Header />
    <CheckoutResumer />
    <div id="contenido">
      <Routes>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/products/:productId" element={<ProductPage />} />
        <Route path="/checkout/:transactionId" element={<PaymentStatusPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  </>
);
