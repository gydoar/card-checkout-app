import { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';
import { Spinner } from './Spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = ({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) => (
  <button
    type={type}
    className={[styles.button, styles[variant], fullWidth ? styles.full : '', className ?? ''].join(' ')}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    {...rest}
  >
    {loading && <Spinner size={18} label="Procesando" />}
    <span>{children}</span>
  </button>
);
