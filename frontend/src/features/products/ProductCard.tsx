import { Link } from 'react-router-dom';
import { Product } from '../../shared/api/types';
import { formatMoney } from '../../shared/lib/money';
import styles from './ProductCard.module.css';
import { StockBadge } from './StockBadge';

export const ProductCard = ({ product, priority = false }: { product: Product; priority?: boolean }) => (
  <article className={styles.card}>
    <Link to={`/products/${product.id}`} className={styles.link}>
      <div className={styles.media}>
        {/* width/height explícitos: el navegador reserva el espacio y no hay saltos de layout (CLS) */}
        <img
          src={product.imageUrl}
          alt={product.name}
          width={400}
          height={300}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
        />
      </div>
      <div className={styles.body}>
        <h2 className={styles.name}>{product.name}</h2>
        <p className={styles.price}>{formatMoney(product.priceInCents, product.currency)}</p>
        <StockBadge stock={product.stock} />
      </div>
    </Link>
  </article>
);
