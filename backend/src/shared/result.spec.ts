import { err, ok, ResultAsync } from './result';

describe('Result / ResultAsync', () => {
  it('ok y err construyen los dos rieles', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('x')).toEqual({ ok: false, error: 'x' });
  });

  it('from acepta Result, Promise<Result> y ResultAsync', async () => {
    const original = ResultAsync.ok<number, string>(1);
    expect(ResultAsync.from(original)).toBe(original);
    expect(await ResultAsync.from(ok(2))).toEqual(ok(2));
    expect(await ResultAsync.from(Promise.resolve(err('e')))).toEqual(err('e'));
  });

  it('map transforma solo el éxito', async () => {
    expect(await ResultAsync.ok(2).map((n) => n * 3)).toEqual(ok(6));
    expect(await ResultAsync.ok(2).map(async (n) => n + 1)).toEqual(ok(3));
    const fn = jest.fn();
    expect(await ResultAsync.err('boom').map(fn)).toEqual(err('boom'));
    expect(fn).not.toHaveBeenCalled();
  });

  it('mapErr transforma solo el error', async () => {
    expect(await ResultAsync.err('a').mapErr((e) => `${e}!`)).toEqual(err('a!'));
    expect(await ResultAsync.ok(1).mapErr(() => 'nope')).toEqual(ok(1));
  });

  it('andThen corta la cadena en el primer error', async () => {
    const third = jest.fn();
    const result = await ResultAsync.ok<number, string>(1)
      .andThen((n) => ok(n + 1))
      .andThen(() => err('falló el paso 2'))
      .andThen(third);
    expect(result).toEqual(err('falló el paso 2'));
    expect(third).not.toHaveBeenCalled();
  });

  it('andThen acepta pasos asíncronos y ResultAsync', async () => {
    const result = await ResultAsync.ok<number, string>(1)
      .andThen(async (n) => ok(n + 1))
      .andThen((n) => ResultAsync.ok(n * 10));
    expect(result).toEqual(ok(20));
  });

  it('tap ejecuta el efecto sin cambiar el valor', async () => {
    const spy = jest.fn();
    expect(await ResultAsync.ok(5).tap(spy)).toEqual(ok(5));
    expect(spy).toHaveBeenCalledWith(5);
  });

  it('orElse permite recuperarse de un error', async () => {
    expect(await ResultAsync.err<string, number>('e').orElse(() => ok(0))).toEqual(ok(0));
    expect(await ResultAsync.ok<number, string>(1).orElse(() => ok(0))).toEqual(ok(1));
  });

  it('fromPromise convierte excepciones en Err tipado', async () => {
    const failing = ResultAsync.fromPromise(Promise.reject(new Error('io')), (c) => (c as Error).message);
    expect(await failing).toEqual(err('io'));
    expect(await ResultAsync.fromPromise(Promise.resolve(7), () => 'x')).toEqual(ok(7));
  });

  it('branch elige camino según el riel y no re-captura errores de onOk', async () => {
    const onErr = jest.fn(() => ok('recuperado'));
    expect(await ResultAsync.ok<number, string>(1).branch((v) => err(`fallo-${v}`), onErr)).toEqual(err('fallo-1'));
    expect(onErr).not.toHaveBeenCalled();
    expect(await ResultAsync.err<string, number>('x').branch(() => ok('no'), onErr)).toEqual(ok('recuperado'));
  });

  it('match colapsa ambos rieles', async () => {
    expect(await ResultAsync.ok(1).match((v) => `ok:${v}`, () => 'err')).toBe('ok:1');
    expect(await ResultAsync.err('e').match(() => 'ok', (e) => `err:${e}`)).toBe('err:e');
  });

  it('then soporta el manejador de rechazo', async () => {
    const onRejected = jest.fn();
    await ResultAsync.ok(1).then(undefined, onRejected);
    expect(onRejected).not.toHaveBeenCalled();
  });
});
