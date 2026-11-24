import { ReactNode, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Backdrop.module.css';
import { useDialog } from './useDialog';

interface BackdropProps {
  title: string;
  subtitle?: string;
  /** Sin onClose el backdrop no se puede descartar (ej. mientras se procesa el pago). */
  onClose?: () => void;
  children: ReactNode;
}

/**
 * Backdrop al estilo Material Design: la capa trasera (la página de producto)
 * queda visible y atenuada, y la capa frontal sube desde abajo con el contenido.
 */
export const Backdrop = ({ title, subtitle, onClose, children }: BackdropProps) => {
  const titleId = useId();
  const layerRef = useRef<HTMLDivElement>(null);
  useDialog(layerRef, onClose);

  return createPortal(
    <div className={styles.scrim} onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <section
        ref={layerRef}
        className={styles.frontLayer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <span className={styles.handle} aria-hidden="true" />
        <header className={styles.subheader}>
          <div>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          </div>
          {onClose && (
            <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar resumen">
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </header>
        <div className={styles.content}>{children}</div>
      </section>
    </div>,
    document.body,
  );
};
