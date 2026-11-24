import { FormEvent, useMemo, useState } from 'react';
import { useAppSelector } from '../../app/store';
import { Alert } from '../../shared/ui/Alert';
import { Button } from '../../shared/ui/Button';
import { SelectField, TextField } from '../../shared/ui/Field';
import { CardBrandLogo } from './card/CardBrandLogo';
import { CardPreview } from './card/CardPreview';
import {
  CardFormValues,
  detectBrand,
  formatCardNumber,
  formatExpiry,
  onlyDigits,
  validateCard,
} from './card/card-validation';
import { useConfirmPaymentDetails } from './card/useConfirmPaymentDetails';
import { COLOMBIA_REGIONS, DeliveryFormValues, validateDelivery } from './delivery/delivery-validation';
import styles from './PaymentDetailsForm.module.css';

const INSTALLMENT_OPTIONS = [1, 2, 3, 6, 12, 24, 36].map((n) => ({
  value: String(n),
  label: n === 1 ? '1 cuota (contado)' : `${n} cuotas`,
}));
const REGION_OPTIONS = COLOMBIA_REGIONS.map((region) => ({ value: region, label: region }));

const EMPTY_CARD: CardFormValues = { number: '', holder: '', expiry: '', cvc: '', installments: 1 };

/**
 * Paso 2: datos de tarjeta + entrega.
 * Los datos de la tarjeta viven SOLO en el estado local de este componente
 * y se descartan al desmontarlo.
 */
export const PaymentDetailsForm = () => {
  const savedDelivery = useAppSelector((state) => state.checkout.delivery);
  const notice = useAppSelector((state) => state.checkout.notice);
  const { confirm, submitting, error } = useConfirmPaymentDetails();

  const [card, setCard] = useState<CardFormValues>(EMPTY_CARD);
  const [delivery, setDelivery] = useState<DeliveryFormValues>(savedDelivery);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [cvcFocused, setCvcFocused] = useState(false);

  const brand = detectBrand(card.number);
  const cardErrors = useMemo(() => validateCard(card), [card]);
  const deliveryErrors = useMemo(() => validateDelivery(delivery), [delivery]);

  /** Los errores se muestran tras salir del campo o al intentar enviar: no regañar mientras se escribe. */
  const visible = (field: string, message?: string) => (submitted || touched.has(field) ? message : undefined);
  const touch = (field: string) => () => setTouched((prev) => new Set(prev).add(field));

  const updateCard = <K extends keyof CardFormValues>(field: K, value: CardFormValues[K]) =>
    setCard((prev) => ({ ...prev, [field]: value }));
  const updateDelivery = (field: keyof DeliveryFormValues, value: string) =>
    setDelivery((prev) => ({ ...prev, [field]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.keys(cardErrors).length > 0 || Object.keys(deliveryErrors).length > 0) return;
    void confirm(card, delivery);
  };

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-label="Datos de pago y entrega">
      {notice && <Alert tone="info">{notice}</Alert>}

      <fieldset className={styles.section}>
        <legend className={styles.legend}>
          <span className={styles.stepNumber}>1</span> Tarjeta de crédito
        </legend>

        <CardPreview number={card.number} holder={card.holder} expiry={card.expiry} brand={brand} flipped={cvcFocused} />

        <div className={styles.grid}>
          <div className={styles.full}>
            <TextField
              label="Número de tarjeta"
              name="cc-number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="0000 0000 0000 0000"
              value={formatCardNumber(card.number)}
              onChange={(e) => updateCard('number', onlyDigits(e.target.value).slice(0, 16))}
              onBlur={touch('number')}
              error={visible('number', cardErrors.number)}
              adornment={<CardBrandLogo brand={brand} size={36} />}
            />
          </div>
          <div className={styles.full}>
            <TextField
              label="Nombre del titular"
              name="cc-name"
              autoComplete="cc-name"
              placeholder="Como aparece en la tarjeta"
              value={card.holder}
              maxLength={60}
              onChange={(e) => updateCard('holder', e.target.value)}
              onBlur={touch('holder')}
              error={visible('holder', cardErrors.holder)}
            />
          </div>
          <TextField
            label="Vencimiento"
            name="cc-exp"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            value={card.expiry}
            onChange={(e) => updateCard('expiry', formatExpiry(e.target.value))}
            onBlur={touch('expiry')}
            error={visible('expiry', cardErrors.expiry)}
          />
          <TextField
            label="CVC"
            name="cc-csc"
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            placeholder="•••"
            value={card.cvc}
            onChange={(e) => updateCard('cvc', onlyDigits(e.target.value).slice(0, 3))}
            onFocus={() => setCvcFocused(true)}
            onBlur={() => {
              setCvcFocused(false);
              touch('cvc')();
            }}
            error={visible('cvc', cardErrors.cvc)}
          />
          <div className={styles.full}>
            <SelectField
              label="Cuotas"
              name="installments"
              value={String(card.installments)}
              options={INSTALLMENT_OPTIONS}
              onChange={(e) => updateCard('installments', Number(e.target.value))}
            />
          </div>
        </div>
        <p className={styles.secureNote}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 10V8a6 6 0 1112 0v2M5 10h14v11H5z" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
          Tu tarjeta se envía cifrada directamente a la pasarela de pagos. Nosotros nunca la almacenamos.
        </p>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>
          <span className={styles.stepNumber}>2</span> Datos de entrega
        </legend>
        <div className={styles.grid}>
          <div className={styles.full}>
            <TextField
              label="Nombre completo"
              name="name"
              autoComplete="name"
              value={delivery.fullName}
              maxLength={120}
              onChange={(e) => updateDelivery('fullName', e.target.value)}
              onBlur={touch('fullName')}
              error={visible('fullName', deliveryErrors.fullName)}
            />
          </div>
          <TextField
            label="Correo electrónico"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={delivery.email}
            maxLength={254}
            onChange={(e) => updateDelivery('email', e.target.value)}
            onBlur={touch('email')}
            error={visible('email', deliveryErrors.email)}
          />
          <TextField
            label="Celular"
            name="tel"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="3001234567"
            value={delivery.phone}
            maxLength={16}
            onChange={(e) => updateDelivery('phone', e.target.value.replace(/[^\d+]/g, ''))}
            onBlur={touch('phone')}
            error={visible('phone', deliveryErrors.phone)}
          />
          <div className={styles.full}>
            <TextField
              label="Dirección"
              name="street-address"
              autoComplete="street-address"
              placeholder="Calle 10 # 43-12, Apto 501"
              value={delivery.addressLine}
              maxLength={200}
              onChange={(e) => updateDelivery('addressLine', e.target.value)}
              onBlur={touch('addressLine')}
              error={visible('addressLine', deliveryErrors.addressLine)}
            />
          </div>
          <TextField
            label="Ciudad"
            name="city"
            autoComplete="address-level2"
            value={delivery.city}
            maxLength={80}
            onChange={(e) => updateDelivery('city', e.target.value)}
            onBlur={touch('city')}
            error={visible('city', deliveryErrors.city)}
          />
          <SelectField
            label="Departamento"
            name="region"
            autoComplete="address-level1"
            value={delivery.region}
            placeholder="Selecciona"
            options={REGION_OPTIONS}
            onChange={(e) => updateDelivery('region', e.target.value)}
            onBlur={touch('region')}
            error={visible('region', deliveryErrors.region)}
          />
          <div className={styles.full}>
            <TextField
              label="Código postal (opcional)"
              name="postal-code"
              inputMode="numeric"
              autoComplete="postal-code"
              value={delivery.postalCode}
              maxLength={10}
              onChange={(e) => updateDelivery('postalCode', onlyDigits(e.target.value))}
              onBlur={touch('postalCode')}
              error={visible('postalCode', deliveryErrors.postalCode)}
            />
          </div>
        </div>
      </fieldset>

      {error && <Alert>{error}</Alert>}

      <div className={styles.actions}>
        <Button type="submit" fullWidth loading={submitting}>
          Continuar al resumen
        </Button>
      </div>
    </form>
  );
};
