import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { TransactionView } from '../../shared/api/types';
import { formatMoney } from '../../shared/lib/money';
import { Alert } from '../../shared/ui/Alert';
import { Button } from '../../shared/ui/Button';
import { Spinner } from '../../shared/ui/Spinner';
import { CardBrandLogo } from './card/CardBrandLogo';
import { refreshTransaction, resetCheckout } from './checkout.slice';
import styles from './PaymentStatusPage.module.css';

export const POLL_INTERVAL_MS = 2500;
export const MAX_POLL_ATTEMPTS = 24; // ~1 minuto
export const REDIRECT_SECONDS = 12;

const COPY: Record<Exclude<TransactionView['status'], 'PENDING'>, { title: string; tone: string; text: string }> = {
  APPROVED: { title: '¡Pago aprobado!', tone: 'success', text: 'Tu pedido quedó confirmado y ya está asignado para envío.' },
  DECLINED: { title: 'Pago rechazado', tone: 'danger', text: 'Tu banco no aprobó el pago. No se realizó ningún cobro.' },
  VOIDED: { title: 'Pago anulado', tone: 'danger', text: 'La transacción fue anulada. No se realizó ningún cobro.' },
  ERROR: { title: 'No pudimos procesar el pago', tone: 'danger', text: 'Ocurrió un problema con el pago. Puedes intentarlo de nuevo.' },
};

/**
 * Paso 4: estado final. Consulta el backend cada 2.5 s mientras la transacción
 * siga PENDING (sobrevive a un refresh: el id está en la URL y en el estado persistido).
 * Al terminar redirige al producto (paso 5) con el stock actualizado.
 */
export const PaymentStatusPage = () => {
  const { transactionId = '' } = useParams();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const transaction = useAppSelector((state) =>
    state.checkout.transaction?.id === transactionId ? state.checkout.transaction : null,
  );
  const error = useAppSelector((state) => state.checkout.error);
  const [attempts, setAttempts] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_SECONDS);
  const finished = transaction !== null && transaction.status !== 'PENDING';
  const timedOut = !finished && attempts >= MAX_POLL_ATTEMPTS;
  const productId = useRef<string | null>(null);
  productId.current = transaction?.product.id ?? productId.current;

  // Polling mientras esté pendiente (o mientras no tengamos la transacción)
  useEffect(() => {
    if (finished || timedOut) return;
    const delay = attempts === 0 && !transaction ? 0 : POLL_INTERVAL_MS;
    const timer = setTimeout(() => {
      void dispatch(refreshTransaction(transactionId));
      setAttempts((n) => n + 1);
    }, delay);
    return () => clearTimeout(timer);
  }, [attempts, dispatch, finished, timedOut, transaction, transactionId]);

  const backToStore = () => {
    const target = productId.current ? `/products/${productId.current}` : '/';
    dispatch(resetCheckout());
    navigate(target, { replace: true });
  };

  // Cuenta regresiva para volver al producto
  useEffect(() => {
    if (!finished) return;
    if (secondsLeft === 0) {
      backToStore();
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished, secondsLeft]);

  if (!finished) {
    return (
      <main className={styles.page}>
        <section className={styles.panel} aria-live="polite">
          {timedOut ? (
            <>
              <h1 className={styles.title}>Seguimos confirmando tu pago</h1>
              <p className={styles.text}>
                La pasarela está tardando más de lo normal. No pagues de nuevo: consulta el estado en un momento.
              </p>
              <Button onClick={() => setAttempts(0)}>Consultar de nuevo</Button>
            </>
          ) : (
            <>
              <Spinner size={48} label="Procesando pago" />
              <h1 className={styles.title}>Procesando tu pago…</h1>
              <p className={styles.text}>Esto suele tardar unos segundos. No cierres esta ventana.</p>
            </>
          )}
          {error && !transaction && <Alert>{error}</Alert>}
          {!transaction && timedOut && <Link to="/">Volver a la tienda</Link>}
        </section>
      </main>
    );
  }

  const copy = COPY[transaction.status as keyof typeof COPY];
  const money = (cents: number) => formatMoney(cents, transaction.amounts.currency);

  return (
    <main className={styles.page}>
      <section className={styles.panel}>
        <div className={`${styles.icon} ${styles[copy.tone]}`} aria-hidden="true">
          {transaction.status === 'APPROVED' ? (
            <svg viewBox="0 0 24 24" width="40" height="40">
              <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" className={styles.check} />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="40" height="40">
              <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          )}
        </div>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.text}>{copy.text}</p>
        {transaction.statusMessage && transaction.status !== 'APPROVED' && (
          <p className={styles.reason}>Motivo: {transaction.statusMessage}</p>
        )}

        <dl className={styles.details}>
          <div>
            <dt>Referencia</dt>
            <dd className={styles.mono}>{transaction.reference}</dd>
          </div>
          <div>
            <dt>Producto</dt>
            <dd>
              {transaction.product.name} × {transaction.quantity}
            </dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{money(transaction.amounts.totalInCents)}</dd>
          </div>
          {transaction.payment.lastFour && (
            <div>
              <dt>Tarjeta</dt>
              <dd className={styles.card}>
                <CardBrandLogo brand={transaction.payment.brand ?? ''} size={30} /> •••• {transaction.payment.lastFour}
              </dd>
            </div>
          )}
          {transaction.status === 'APPROVED' && (
            <div>
              <dt>Envío a</dt>
              <dd>
                {transaction.delivery.city}, {transaction.delivery.region}
              </dd>
            </div>
          )}
          <div>
            <dt>Recibo enviado a</dt>
            <dd>{transaction.customer.email}</dd>
          </div>
        </dl>

        <Button fullWidth onClick={backToStore}>
          Volver a la tienda
        </Button>
        <p className={styles.redirect} aria-live="off">
          Te llevaremos al producto en {secondsLeft} s
        </p>
      </section>
    </main>
  );
};
