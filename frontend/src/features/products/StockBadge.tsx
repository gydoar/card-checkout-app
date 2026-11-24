import styles from './StockBadge.module.css';

export const LOW_STOCK_THRESHOLD = 3;

export const StockBadge = ({ stock }: { stock: number }) => {
  if (stock === 0) return <span className={`${styles.badge} ${styles.out}`}>Agotado</span>;
  if (stock <= LOW_STOCK_THRESHOLD) {
    return (
      <span className={`${styles.badge} ${styles.low}`}>
        {stock === 1 ? '¡Última unidad!' : `¡Últimas ${stock} unidades!`}
      </span>
    );
  }
  return <span className={styles.badge}>{stock} disponibles</span>;
};
