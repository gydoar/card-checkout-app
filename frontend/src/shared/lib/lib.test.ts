import { formatMoney } from './money';
import { safeStorage } from './storage';
import { uuidV4 } from './uuid';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('formatMoney', () => {
  it('convierte centavos a pesos sin decimales', () => {
    expect(formatMoney(389_900_00)).toMatch(/389\.900/);
    expect(formatMoney(100, 'USD')).toMatch(/1/);
  });
});

describe('safeStorage', () => {
  it('lee, escribe y borra JSON', () => {
    safeStorage.write('k', { a: 1 });
    expect(safeStorage.read('k')).toEqual({ a: 1 });
    safeStorage.remove('k');
    expect(safeStorage.read('k')).toBeNull();
  });

  it('nunca lanza aunque el almacenamiento falle', () => {
    const proto = Object.getPrototypeOf(window.localStorage);
    const spies = ['getItem', 'setItem', 'removeItem'].map((m) =>
      jest.spyOn(proto, m).mockImplementation(() => {
        throw new Error('bloqueado');
      }),
    );
    expect(safeStorage.read('k')).toBeNull();
    expect(() => safeStorage.write('k', 1)).not.toThrow();
    expect(() => safeStorage.remove('k')).not.toThrow();
    spies.forEach((s) => s.mockRestore());
  });
});

describe('uuidV4', () => {
  it('usa crypto.randomUUID si existe', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: () => 'nativo', configurable: true });
    expect(uuidV4()).toBe('nativo');
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  });

  it('genera un UUID v4 válido con getRandomValues como respaldo', () => {
    const original = crypto.randomUUID;
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    expect(uuidV4()).toMatch(UUID);
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  });
});
