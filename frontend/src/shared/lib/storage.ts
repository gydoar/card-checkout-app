/**
 * Acceso seguro a localStorage: en modo privado, con cuota llena o con
 * almacenamiento bloqueado, `localStorage` lanza excepciones. La app debe
 * seguir funcionando (solo pierde la recuperación tras refresh).
 */
export const safeStorage = {
  read<T>(key: string): T | null {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },

  write(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* sin almacenamiento disponible: se ignora */
    }
  },

  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* sin almacenamiento disponible: se ignora */
    }
  },
};
