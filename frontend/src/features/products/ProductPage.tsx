import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { formatMoney } from '../../shared/lib/money';
import { Alert } from '../../shared/ui/Alert';
import { Button } from '../../shared/ui/Button';
import { Spinner } from '../../shared/ui/Spinner';
import { CheckoutModal } from '../checkout/CheckoutModal';
import { loadCheckoutConfig, startCheckout } from '../checkout/checkout.slice';
import { SummaryBackdrop } from '../checkout/SummaryBackdrop';
import styles from './ProductPage.module.css';
import { fetchProduct } from './products.slice';
import { QuantityStepper } from './QuantityStepper';
import { StockBadge } from './StockBadge';

/**
 * Pasos 1 y 5: detalle del producto con stock en vivo.
 * El modal (paso 2) y el backdrop (paso 3) se superponen a esta página según el estado del checkout.
 */
export const ProductPage = () => {
  const { productId = '' } = useParams();
  const dispatch = useAppDispatch();
  const product = useAppSelector((state) => state.products.byId[productId]);
  const status = useAppSelector((state) => state.products.detailStatus[productId]);
  const error = useAppSelector((state) => state.products.error);
  const checkout = useAppSelector((state) => state.checkout);
  const isActiveCheckout = checkout.productId === productId;
  const [quantity, setQuantity] = useState(isActiveCheckout ? checkout.quantity : 1);

  // Siempre se consulta al entrar: así al volver del pago se ve el stock actualizado
  useEffect(() => {
    void dispatch(fetchProduct(productId));
  }, [dispatch, productId]);

  // Si el stock bajó por debajo de la cantidad elegida, se ajusta
  const maxQuantity = Math.max(1, product?.maxUnitsPerOrder ?? 1);
  const safeQuantity = Math.min(quantity, maxQuantity);

  if (!product) {
    return (
      <main className={styles.centered}>
        {status === 'failed' ? (
          <>
            <Alert>{error ?? 'No encontramos este producto.'}</Alert>
            <Link to="/">Ver el catálogo</Link>
          </>
        ) : (
          <Spinner size={40} />
        )}
      </main>
    );
  }

  const soldOut = product.stock === 0;
  const showModal = isActiveCheckout && checkout.step === 'DETAILS';
  const showSummary =
    isActiveCheckout && (checkout.step === 'SUMMARY' || (checkout.step === 'PROCESSING' && !checkout.transaction));

  const openCheckout = () => {
    dispatch(startCheckout({ productId: product.id, quantity: safeQuantity }));
    void dispatch(loadCheckoutConfig());
  };

  return (
    <main className={styles.page}>
      <Link to="/" className={styles.back}>
        ← Catálogo
      </Link>
      <div className={styles.layout}>
        <div className={styles.media}>
          {/* Imagen principal (LCP): carga prioritaria */}
          <img src={product.imageUrl} alt={product.name} width={400} height={300} fetchPriority="high" decoding="async" />
        </div>

        <section className={styles.info}>
          <div className={styles.heading}>
            <h1 className={styles.name}>{product.name}</h1>
            <StockBadge stock={product.stock} />
          </div>
          <p className={styles.price}>{formatMoney(product.priceInCents, product.currency)}</p>
          <p className={styles.description}>{product.description}</p>

          <div className={styles.purchase}>
            {!soldOut && (
              <div className={styles.quantityRow}>
                <span className={styles.label}>Cantidad</span>
                <QuantityStepper value={safeQuantity} max={maxQuantity} onChange={setQuantity} />
              </div>
            )}
            <Button fullWidth onClick={openCheckout} disabled={soldOut}>
              {soldOut ? 'Agotado' : 'Pagar con tarjeta de crédito'}
            </Button>
            <ul className={styles.perks}>
              <li>Envío a todo Colombia</li>
              <li>Visa y Mastercard</li>
            </ul>
          </div>
        </section>
      </div>

      {showModal && <CheckoutModal />}
      {showSummary && <SummaryBackdrop product={product} />}
    </main>
  );
};
