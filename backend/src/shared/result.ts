/**
 * Railway Oriented Programming (ROP).
 *
 * Cada operación devuelve un `Result`: o va por el riel del éxito (`Ok`)
 * o por el riel del error (`Err`). Al encadenar pasos con `andThen`,
 * el primer error "desvía el tren" y los pasos siguientes no se ejecutan.
 * Así los casos de uso se leen como una secuencia lineal, sin try/catch
 * ni ifs anidados, y los errores esperados son parte del tipo de retorno.
 */

export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

export type Result<T, E> = Ok<T> | Err<E>;

export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

type Awaitable<T> = T | Promise<T>;
type ResultLike<T, E> = Result<T, E> | Promise<Result<T, E>> | ResultAsync<T, E>;

/**
 * Versión asíncrona y encadenable de `Result`.
 * Implementa `PromiseLike`, así que se puede usar con `await` directamente.
 */
export class ResultAsync<T, E> implements PromiseLike<Result<T, E>> {
  private constructor(private readonly promise: Promise<Result<T, E>>) {}

  static from<T, E>(source: ResultLike<T, E>): ResultAsync<T, E> {
    if (source instanceof ResultAsync) return source;
    return new ResultAsync(Promise.resolve(source));
  }

  static ok<T, E = never>(value: T): ResultAsync<T, E> {
    return new ResultAsync(Promise.resolve(ok(value)));
  }

  static err<E, T = never>(error: E): ResultAsync<T, E> {
    return new ResultAsync(Promise.resolve(err(error)));
  }

  /**
   * Envuelve una promesa que puede lanzar excepciones (I/O, librerías externas)
   * y convierte el rechazo en un `Err` tipado. Es la frontera entre el mundo
   * "con excepciones" y el mundo ROP.
   */
  static fromPromise<T, E>(promise: Promise<T>, onError: (cause: unknown) => E): ResultAsync<T, E> {
    return new ResultAsync(promise.then((value) => ok(value), (cause) => err(onError(cause))));
  }

  /** Transforma el valor de éxito. Si hay error, lo propaga intacto. */
  map<U>(fn: (value: T) => Awaitable<U>): ResultAsync<U, E> {
    return new ResultAsync(
      this.promise.then(async (result) => (result.ok ? ok(await fn(result.value)) : result)),
    );
  }

  /** Transforma el error. Si hay éxito, lo propaga intacto. */
  mapErr<F>(fn: (error: E) => F): ResultAsync<T, F> {
    return new ResultAsync(this.promise.then((result) => (result.ok ? result : err(fn(result.error)))));
  }

  /** Encadena un paso que también puede fallar (el "switch" de ROP). */
  andThen<U, F>(fn: (value: T) => ResultLike<U, F>): ResultAsync<U, E | F> {
    return new ResultAsync<U, E | F>(
      this.promise.then(
        (result): Result<U, E | F> | Promise<Result<U, E | F>> =>
          result.ok ? ResultAsync.from<U, E | F>(fn(result.value)).promise : result,
      ),
    );
  }

  /** Ejecuta un efecto secundario sin alterar el valor (ej. logging). */
  tap(fn: (value: T) => Awaitable<void>): ResultAsync<T, E> {
    return this.map(async (value) => {
      await fn(value);
      return value;
    });
  }

  /** Permite recuperarse de un error con otro cálculo. */
  orElse<F>(fn: (error: E) => ResultLike<T, F>): ResultAsync<T, F> {
    return new ResultAsync<T, F>(
      this.promise.then((result) => (result.ok ? result : ResultAsync.from(fn(result.error)).promise)),
    );
  }

  /**
   * Continúa por un camino distinto según el riel. A diferencia de `andThen`
   * + `orElse` encadenados, el manejador de error solo ve errores de ESTE paso,
   * no los que pueda producir `onOk`.
   */
  branch<U, F>(onOk: (value: T) => ResultLike<U, F>, onErr: (error: E) => ResultLike<U, F>): ResultAsync<U, F> {
    return new ResultAsync<U, F>(
      this.promise.then((result) =>
        ResultAsync.from(result.ok ? onOk(result.value) : onErr(result.error)).promise,
      ),
    );
  }

  /** Colapsa ambos rieles en un único valor. */
  match<U>(onOk: (value: T) => U, onErr: (error: E) => U): Promise<U> {
    return this.promise.then((result) => (result.ok ? onOk(result.value) : onErr(result.error)));
  }

  then<R1 = Result<T, E>, R2 = never>(
    onFulfilled?: ((value: Result<T, E>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.promise.then(onFulfilled, onRejected);
  }
}
