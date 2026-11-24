import { Link } from 'react-router-dom';
import styles from './Header.module.css';

export const Header = () => (
  <header className={styles.header}>
    <div className={styles.inner}>
      <Link to="/" className={styles.brand} aria-label="TRAZO, ir al inicio">
        <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
          <rect width="32" height="32" rx="9" fill="currentColor" />
          <path d="M8 21c5-1 9-5 16-11" stroke="var(--color-accent)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </svg>
        <span>TRAZO</span>
      </Link>
      <span className={styles.secure}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M6 10V8a6 6 0 1112 0v2M5 10h14v11H5z" stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round" />
        </svg>
        Pago seguro
      </span>
    </div>
  </header>
);
