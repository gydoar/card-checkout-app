import { CardBrandLogo } from './CardBrandLogo';
import { CardBrand, onlyDigits } from './card-validation';
import styles from './CardPreview.module.css';

interface CardPreviewProps {
  number: string;
  holder: string;
  expiry: string;
  brand: CardBrand;
  flipped: boolean;
}

/** Tarjeta visual que refleja lo que se escribe y gira al llegar al CVC. Solo decorativa. */
export const CardPreview = ({ number, holder, expiry, brand, flipped }: CardPreviewProps) => {
  // Se rellena con "•" hasta 16 posiciones para mantener siempre el ancho del número
  const display = onlyDigits(number)
    .slice(0, 16)
    .padEnd(16, '•')
    .replace(/(.{4})(?=.)/g, '$1 ');

  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={`${styles.card} ${flipped ? styles.flipped : ''} ${styles[brand.toLowerCase()] ?? ''}`}>
        <div className={`${styles.face} ${styles.front}`}>
          <div className={styles.topRow}>
            <span className={styles.chip} />
            <CardBrandLogo brand={brand} size={52} />
          </div>
          <p className={styles.number}>{display}</p>
          <div className={styles.bottomRow}>
            <div>
              <span className={styles.caption}>Titular</span>
              <p className={styles.value}>{holder.trim() || 'NOMBRE APELLIDO'}</p>
            </div>
            <div>
              <span className={styles.caption}>Vence</span>
              <p className={styles.value}>{expiry || 'MM/AA'}</p>
            </div>
          </div>
        </div>
        <div className={`${styles.face} ${styles.back}`}>
          <span className={styles.stripe} />
          <span className={styles.cvc}>•••</span>
        </div>
      </div>
    </div>
  );
};
