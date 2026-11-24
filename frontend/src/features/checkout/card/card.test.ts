import { mockFetch, route } from '../../../test/mock-fetch';
import { tokenizeCard } from './card-tokenizer';
import {
  detectBrand,
  formatCardNumber,
  formatExpiry,
  parseExpiry,
  passesLuhn,
  validateCard,
} from './card-validation';

describe('validación de tarjetas', () => {
  it.each([
    ['4242 4242 4242 4242', 'VISA'],
    ['5555555555554444', 'MASTERCARD'],
    ['2223003122003222', 'MASTERCARD'],
    ['2720990000000000', 'MASTERCARD'],
    ['2721000000000000', 'UNKNOWN'],
    ['222', 'UNKNOWN'],
    ['378282246310005', 'UNKNOWN'],
    ['', 'UNKNOWN'],
  ])('detectBrand(%s) = %s', (number, brand) => expect(detectBrand(number)).toBe(brand));

  it('Luhn', () => {
    expect(passesLuhn('4242424242424242')).toBe(true);
    expect(passesLuhn('4242424242424241')).toBe(false);
    expect(passesLuhn('')).toBe(false);
  });

  it('formatea número y vencimiento mientras se escribe', () => {
    expect(formatCardNumber('42424242424242429999')).toBe('4242 4242 4242 4242');
    expect(formatCardNumber('4242a42')).toBe('4242 42');
    expect(formatExpiry('1')).toBe('1');
    expect(formatExpiry('12')).toBe('12');
    expect(formatExpiry('1229')).toBe('12/29');
    expect(parseExpiry('12/29')).toEqual({ month: '12', year: '29' });
    expect(parseExpiry('1229')).toBeNull();
  });

  const now = new Date('2026-06-15');
  const valid = { number: '4242424242424242', holder: 'Ana Gómez', expiry: '12/29', cvc: '123', installments: 1 };

  it('acepta una tarjeta válida', () => expect(validateCard(valid, now)).toEqual({}));

  it.each([
    [{ number: '4242424242424241' }, 'number', 'Número de tarjeta inválido'],
    [{ number: '378282246310005' }, 'number', 'Número de tarjeta inválido'],
    [{ number: '6011111111111117' }, 'number', 'Solo aceptamos tarjetas Visa y Mastercard'],
    [{ holder: 'A' }, 'holder', 'Escribe el nombre como aparece en la tarjeta'],
    [{ expiry: '1229' }, 'expiry', 'Usa el formato MM/AA'],
    [{ expiry: '13/29' }, 'expiry', 'Mes inválido'],
    [{ expiry: '05/26' }, 'expiry', 'La tarjeta está vencida'],
    [{ expiry: '12/60' }, 'expiry', 'Fecha de vencimiento inválida'],
    [{ cvc: '12' }, 'cvc', 'El CVC tiene 3 dígitos'],
    [{ installments: 0 }, 'installments', 'Cuotas inválidas'],
  ])('rechaza %p', (patch, field, message) => {
    expect(validateCard({ ...valid, ...patch }, now)).toEqual({ [field]: message });
  });

  it('el mes actual todavía es válido', () => {
    expect(validateCard({ ...valid, expiry: '06/26' }, now)).toEqual({});
  });

  it('usa la fecha actual por defecto', () => {
    expect(validateCard({ ...valid, expiry: '01/20' }).expiry).toBe('La tarjeta está vencida');
  });
});

describe('tokenizeCard', () => {
  const card = { number: '4242424242424242', cvc: '123', expMonth: '12', expYear: '29', holder: 'Ana' };
  const gateway = { baseUrl: 'https://gateway.test/v1', publicKey: 'pub_test' };

  it('envía la tarjeta a la pasarela con la llave pública y devuelve solo el token', async () => {
    const fetchMock = mockFetch([
      route('POST', /gateway\.test\/v1\/tokens\/cards$/, {
        status: 201,
        body: { data: { id: 'tok_1', brand: 'VISA', last_four: '4242' } },
      }),
    ]);
    expect(await tokenizeCard(card, gateway)).toEqual({ token: 'tok_1', brand: 'VISA', lastFour: '4242' });
    const init = fetchMock.mock.calls[0][1]!;
    expect(init.headers).toMatchObject({ Authorization: 'Bearer pub_test' });
    expect(JSON.parse(init.body as string)).toEqual({
      number: '4242424242424242',
      cvc: '123',
      exp_month: '12',
      exp_year: '29',
      card_holder: 'Ana',
    });
  });

  it('4xx de la pasarela => CARD_REJECTED con mensaje claro', async () => {
    mockFetch([route('POST', /tokens/, { status: 422, body: { error: { type: 'INPUT_VALIDATION_ERROR' } } })]);
    await expect(tokenizeCard(card, gateway)).rejects.toMatchObject({ code: 'CARD_REJECTED' });
  });

  it('otros errores se propagan', async () => {
    mockFetch([route('POST', /tokens/, new Error('offline'))]);
    await expect(tokenizeCard(card, gateway)).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
