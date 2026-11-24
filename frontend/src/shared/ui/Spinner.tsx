import styles from './Spinner.module.css';

export const Spinner = ({ size = 24, label = 'Cargando' }: { size?: number; label?: string }) => (
  <span className={styles.spinner} style={{ width: size, height: size }} role="status" aria-label={label} />
);
