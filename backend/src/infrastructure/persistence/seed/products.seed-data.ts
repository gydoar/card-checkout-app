/**
 * Catálogo de prueba: zapatillas de "TRAZO", una marca ficticia creada para este proyecto.
 * Las imágenes son ilustraciones SVG propias servidas por el frontend (livianas y sin derechos de terceros).
 * Precios en centavos de COP.
 */
export interface ProductSeed {
  readonly sku: string;
  readonly name: string;
  readonly description: string;
  readonly priceInCents: number;
  readonly currency: string;
  readonly stock: number;
  readonly imageUrl: string;
}

export const PRODUCT_SEEDS: readonly ProductSeed[] = [
  {
    sku: 'TRZ-AIRE-001',
    name: 'Aire Runner',
    description:
      'Zapatilla de running con espuma de doble densidad y malla transpirable. Ligera para rodajes diarios en ciudad.',
    priceInCents: 389_900_00,
    currency: 'COP',
    stock: 12,
    imageUrl: '/images/products/aire-runner.svg',
  },
  {
    sku: 'TRZ-CUMB-002',
    name: 'Cumbre Trail',
    description:
      'Suela con tacos de 5 mm y puntera reforzada para senderos de montaña. Agarre firme en terreno húmedo.',
    priceInCents: 459_900_00,
    currency: 'COP',
    stock: 7,
    imageUrl: '/images/products/cumbre-trail.svg',
  },
  {
    sku: 'TRZ-URBA-003',
    name: 'Urbano Low',
    description: 'Silueta baja de cuero vegano y suela de caucho natural. Para el día a día, sin complicaciones.',
    priceInCents: 299_900_00,
    currency: 'COP',
    stock: 15,
    imageUrl: '/images/products/urbano-low.svg',
  },
  {
    sku: 'TRZ-PULS-004',
    name: 'Pulso Court',
    description: 'Zapatilla de cancha con soporte lateral y suela que no marca. Edición limitada.',
    priceInCents: 349_900_00,
    currency: 'COP',
    stock: 3,
    imageUrl: '/images/products/pulso-court.svg',
  },
];
