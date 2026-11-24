import { filledDelivery } from '../../../test/fixtures';
import { validateDelivery } from './delivery-validation';

describe('validateDelivery', () => {
  it('acepta datos completos (postal opcional)', () => {
    expect(validateDelivery(filledDelivery)).toEqual({});
    expect(validateDelivery({ ...filledDelivery, postalCode: '050021' })).toEqual({});
  });

  it('marca cada campo inválido', () => {
    expect(
      validateDelivery({
        fullName: 'A1',
        email: 'malo@',
        phone: '12',
        addressLine: 'c',
        city: '9',
        region: 'Narnia',
        postalCode: 'abc',
      }),
    ).toEqual({
      fullName: expect.any(String),
      email: expect.any(String),
      phone: expect.any(String),
      addressLine: expect.any(String),
      city: expect.any(String),
      region: expect.any(String),
      postalCode: expect.any(String),
    });
  });
});
