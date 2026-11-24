import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { Modal } from '../../shared/ui/Modal';
import { closeCheckout, loadCheckoutConfig } from './checkout.slice';
import { PaymentDetailsForm } from './PaymentDetailsForm';

/** Paso 2 del flujo: se abre con "Pagar con tarjeta". */
export const CheckoutModal = () => {
  const dispatch = useAppDispatch();
  const hasConfig = useAppSelector((state) => state.checkout.config !== null);

  // Se precarga la configuración (llave pública, tarifas) mientras el usuario escribe
  useEffect(() => {
    if (!hasConfig) void dispatch(loadCheckoutConfig());
  }, [dispatch, hasConfig]);

  return (
    <Modal title="Pagar con tarjeta" onClose={() => dispatch(closeCheckout())}>
      <PaymentDetailsForm />
    </Modal>
  );
};
