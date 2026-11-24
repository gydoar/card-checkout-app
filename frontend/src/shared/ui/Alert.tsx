import { ReactNode } from 'react';
import styles from './Alert.module.css';

/** `error` se anuncia de inmediato a lectores de pantalla; `info` de forma cortés. */
export const Alert = ({ tone = 'error', children }: { tone?: 'error' | 'info'; children: ReactNode }) => (
  <div className={`${styles.alert} ${styles[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
    {children}
  </div>
);
