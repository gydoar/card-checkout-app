/** Datos de contacto y envío. Mismas reglas que el backend (DTO) para no sorprender al usuario. */
export interface DeliveryFormValues {
  fullName: string;
  email: string;
  phone: string;
  addressLine: string;
  city: string;
  region: string;
  postalCode: string;
}

export type DeliveryFormErrors = Partial<Record<keyof DeliveryFormValues, string>>;

export const EMPTY_DELIVERY: DeliveryFormValues = {
  fullName: '',
  email: '',
  phone: '',
  addressLine: '',
  city: '',
  region: '',
  postalCode: '',
};

/** Departamentos de Colombia: un select evita errores de digitación en la región. */
export const COLOMBIA_REGIONS = [
  'Amazonas', 'Antioquia', 'Arauca', 'Atlántico', 'Bogotá D.C.', 'Bolívar', 'Boyacá', 'Caldas', 'Caquetá',
  'Casanare', 'Cauca', 'Cesar', 'Chocó', 'Córdoba', 'Cundinamarca', 'Guainía', 'Guaviare', 'Huila', 'La Guajira',
  'Magdalena', 'Meta', 'Nariño', 'Norte de Santander', 'Putumayo', 'Quindío', 'Risaralda', 'San Andrés',
  'Santander', 'Sucre', 'Tolima', 'Valle del Cauca', 'Vaupés', 'Vichada',
] as const;

const NAME = /^[\p{L}][\p{L}\s'.-]*$/u;

export const validateDelivery = (values: DeliveryFormValues): DeliveryFormErrors => {
  const errors: DeliveryFormErrors = {};
  const fullName = values.fullName.trim();
  if (fullName.length < 3 || !NAME.test(fullName)) errors.fullName = 'Escribe tu nombre completo';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) errors.email = 'Correo electrónico inválido';
  if (!/^\+?\d{7,15}$/.test(values.phone.trim())) errors.phone = 'Teléfono de 7 a 15 dígitos';
  if (values.addressLine.trim().length < 5) errors.addressLine = 'Escribe la dirección completa';
  const city = values.city.trim();
  if (city.length < 2 || !NAME.test(city)) errors.city = 'Ciudad inválida';
  if (!(COLOMBIA_REGIONS as readonly string[]).includes(values.region)) errors.region = 'Selecciona un departamento';
  if (values.postalCode.trim() && !/^\d{4,10}$/.test(values.postalCode.trim())) {
    errors.postalCode = 'Código postal inválido';
  }
  return errors;
};
