import { CardBrand } from './card-validation';

/** Marcas dibujadas en SVG inline: cero peticiones extra y se ven nítidas en cualquier pantalla. */
export const CardBrandLogo = ({ brand, size = 40 }: { brand: CardBrand | string; size?: number }) => {
  if (brand === 'VISA') {
    return (
      <svg viewBox="0 0 48 16" width={size} height={(size * 16) / 48} role="img" aria-label="Visa">
        <text x="0" y="14" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontStyle="italic" fontSize="16" fill="#1a1f71">
          VISA
        </text>
      </svg>
    );
  }
  if (brand === 'MASTERCARD') {
    return (
      <svg viewBox="0 0 40 24" width={size} height={(size * 24) / 40} role="img" aria-label="Mastercard">
        <circle cx="14" cy="12" r="10" fill="#eb001b" />
        <circle cx="26" cy="12" r="10" fill="#f79e1b" />
        <path d="M20 4a10 10 0 010 16 10 10 0 010-16z" fill="#ff5f00" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 40 24" width={size} height={(size * 24) / 40} role="img" aria-label="Tarjeta">
      <rect x="1" y="1" width="38" height="22" rx="4" fill="none" stroke="currentColor" strokeWidth="2" opacity=".4" />
      <rect x="1" y="7" width="38" height="4" fill="currentColor" opacity=".4" />
    </svg>
  );
};
