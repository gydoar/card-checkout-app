import styles from './QuantityStepper.module.css';

interface QuantityStepperProps {
  value: number;
  max: number;
  onChange: (value: number) => void;
}

export const QuantityStepper = ({ value, max, onChange }: QuantityStepperProps) => (
  <div className={styles.stepper} role="group" aria-label="Cantidad">
    <button type="button" onClick={() => onChange(value - 1)} disabled={value <= 1} aria-label="Disminuir cantidad">
      −
    </button>
    <output aria-live="polite" aria-label="Cantidad seleccionada">
      {value}
    </output>
    <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="Aumentar cantidad">
      +
    </button>
  </div>
);
