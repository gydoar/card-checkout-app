import { ReactNode, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';
import { useDialog } from './useDialog';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Diálogo modal: hoja a pantalla completa en móvil, ventana centrada en escritorio. */
export const Modal = ({ title, onClose, children }: ModalProps) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialog(dialogRef, onClose);

  return createPortal(
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
      </div>
    </div>,
    document.body,
  );
};
