import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../app/store';
import { Alert } from '../../shared/ui/Alert';
import { Button } from '../../shared/ui/Button';
import styles from './CatalogPage.module.css';
import { ProductCard } from './ProductCard';
import { fetchProducts } from './products.slice';

/** Paso 1: catálogo con stock disponible. */
export const CatalogPage = () => {
  const dispatch = useAppDispatch();
  const { ids, byId, listStatus, error } = useAppSelector((state) => state.products);

  useEffect(() => {
    void dispatch(fetchProducts());
  }, [dispatch]);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.kicker}>Colección 2026</p>
        <h1 className={styles.title}>Cada paso deja un trazo.</h1>
        <p className={styles.lead}>Zapatillas hechas para moverse por la ciudad y la montaña.</p>
      </section>

      {listStatus === 'failed' && (
        <div className={styles.feedback}>
          <Alert>{error}</Alert>
          <Button variant="secondary" onClick={() => dispatch(fetchProducts())}>
            Reintentar
          </Button>
        </div>
      )}

      <section aria-label="Productos" aria-busy={listStatus === 'loading'} className={styles.grid}>
        {listStatus === 'loading' && ids.length === 0
          ? Array.from({ length: 4 }, (_, i) => <div key={i} className={styles.skeleton} aria-hidden="true" />)
          : ids.map((id, index) => <ProductCard key={id} product={byId[id]} priority={index < 2} />)}
      </section>
    </main>
  );
};
