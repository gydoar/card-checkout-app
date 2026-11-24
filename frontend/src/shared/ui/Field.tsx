import { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, useId } from 'react';
import styles from './Field.module.css';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  adornment?: ReactNode;
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode;
}

/** Etiqueta + control + error accesibles (aria-invalid / aria-describedby). */
const FieldShell = ({ label, error, hint, adornment, children }: FieldShellProps) => {
  const inputId = useId();
  const messageId = `${inputId}-message`;
  const message = error ?? hint;
  return (
    <div className={`${styles.field} ${error ? styles.invalid : ''}`}>
      <label htmlFor={inputId} className={styles.label}>
        {label}
      </label>
      <div className={styles.control}>
        {children({ inputId, describedBy: message ? messageId : undefined })}
        {adornment && <span className={styles.adornment}>{adornment}</span>}
      </div>
      {message && (
        <p id={messageId} className={error ? styles.error : styles.hint}>
          {message}
        </p>
      )}
    </div>
  );
};

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: string;
  error?: string;
  hint?: string;
  adornment?: ReactNode;
};

export const TextField = ({ label, error, hint, adornment, ...inputProps }: TextFieldProps) => (
  <FieldShell label={label} error={error} hint={hint} adornment={adornment}>
    {({ inputId, describedBy }) => (
      <input
        id={inputId}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
    )}
  </FieldShell>
);

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: string;
  error?: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
};

export const SelectField = ({ label, error, options, placeholder, ...selectProps }: SelectFieldProps) => (
  <FieldShell label={label} error={error}>
    {({ inputId, describedBy }) => (
      <select
        id={inputId}
        className={`${styles.input} ${styles.select}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...selectProps}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )}
  </FieldShell>
);
