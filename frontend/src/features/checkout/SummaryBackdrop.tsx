import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { Product } from '../../shared/api/types';
import { formatMoney } from '../../shared/lib/money';
import { Alert } from '../../shared/ui/Alert';
import { Backdrop } from '../../shared/ui/Backdrop';
import { Button } from '../../shared/ui/Button';
import { Spinner } from '../../shared/ui/Spinner';
import { CardBrandLogo } from './card/CardBrandLogo';
import { closeCheckout, editDetails, payOrder } from './checkout.slice';
import styles from './SummaryBackdrop.module.css';

/**
 * Paso 3: resumen del pago (producto + tarifa base + envío) en un backdrop.
 * El total mostrado es informativo: el backend lo recalcula siempre.
 */
export const SummaryBackdrop = ({ product }: { product: Product }) => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { quantity, card, delivery, config, busy, error } = useAppSelector((state) => state.checkout);
  const [accepted, setAccepted] = useState(false);

  if (!config || !card) {
    return (
      <Backdrop title="Resumen de pago">
        <div className={styles.loading}>
          <Spinner />
        </div>
      </Backdrop>
    );
  }

  const productAmount = product.priceInCents * quantity;
  const total = productAmount + config.fees.baseFeeInCents + config.fees.deliveryFeeInCents;
  const money = (cents: number) => formatMoney(cents, product.currency);

  const pay = async () => {
    const result = await dispatch(payOrder());
    if (payOrder.fulfilled.match(result)) navigate(`/checkout/${result.payload.id}`);
  };

  return (
    <Backdrop
      title="Resumen de pago"
      subtitle="Revisa los detalles antes de pagar"
      onClose={busy ? undefined : () => dispatch(editDetails())}
    >
      <div className={styles.layout}>
        <div className={styles.productRow}>
          <img src={product.imageUrl} alt="" width={64} height={48} className={styles.thumb} decoding="async" />
          <div>
            <p className={styles.productName}>{product.name}</p>
            <p className={styles.muted}>
              {quantity} {quantity === 1 ? 'unidad' : 'unidades'} × {money(product.priceInCents)}
            </p>
          </div>
        </div>

        <dl className={styles.lines}>
          <div className={styles.line}>
            <dt>Producto</dt>
            <dd>{money(productAmount)}</dd>
          </div>
          <div className={styles.line}>
            <dt>Tarifa base</dt>
            <dd>{money(config.fees.baseFeeInCents)}</dd>
          </div>
          <div className={styles.line}>
            <dt>Envío</dt>
            <dd>{money(config.fees.deliveryFeeInCents)}</dd>
          </div>
          <div className={`${styles.line} ${styles.total}`}>
            <dt>Total</dt>
            <dd>{money(total)}</dd>
          </div>
        </dl>

        <div className={styles.cards}>
          <div className={styles.infoCard}>
            <span className={styles.caption}>Pago</span>
            <div className={styles.method}>
              <CardBrandLogo brand={card.brand} size={36} />
              <span>•••• {card.lastFour}</span>
            </div>
            <span className={styles.muted}>
              {card.installments === 1 ? 'Una cuota' : `${card.installments} cuotas`}
            </span>
          </div>
          <div className={styles.infoCard}>
            <span className={styles.caption}>Entrega</span>
            <span>{delivery.fullName}</span>
            <span className={styles.muted}>
              {delivery.addressLine}, {delivery.city}
            </span>
          </div>
        </div>

        <label className={styles.terms}>
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} disabled={busy} />
          <span>
            Acepto el{' '}
            <a href={config.legal.acceptancePermalink} target="_blank" rel="noopener noreferrer">
              reglamento de uso
            </a>{' '}
            y autorizo el{' '}
            <a href={config.legal.personalDataAuthPermalink} target="_blank" rel="noopener noreferrer">
              tratamiento de mis datos personales
            </a>
            .
          </span>
        </label>

        {error && <Alert>{error}</Alert>}

        <div className={styles.actions}>
          <Button fullWidth onClick={pay} loading={busy} disabled={!accepted}>
            Pagar {money(total)}
          </Button>
          <div className={styles.secondaryActions}>
            <Button variant="ghost" onClick={() => dispatch(editDetails())} disabled={busy}>
              Editar datos
            </Button>
            <Button variant="ghost" onClick={() => dispatch(closeCheckout())} disabled={busy}>
              Cancelar compra
            </Button>
          </div>
        </div>
      </div>
    </Backdrop>
  );
};
