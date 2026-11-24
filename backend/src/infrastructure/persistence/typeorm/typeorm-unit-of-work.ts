import { DataSource } from 'typeorm';
import { Repositories, UnitOfWork } from '../../../application/ports/repositories.port';
import { persistenceError } from '../../../application/shared/from-repository';
import { DomainError } from '../../../domain/errors/domain-error';
import { ResultAsync } from '../../../shared/result';
import { createTypeOrmRepositories } from './typeorm-repositories';

/** Señal interna para forzar el ROLLBACK cuando el trabajo termina en el riel de error. */
class RollbackSignal extends Error {
  constructor(readonly domainError: DomainError) {
    super(domainError.message);
  }
}

/**
 * Une ROP con transacciones SQL: TypeORM hace ROLLBACK cuando el callback lanza,
 * así que un `Err` se convierte en excepción solo dentro de esta frontera
 * y se vuelve a convertir en `Err` al salir.
 */
export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly dataSource: DataSource) {}

  run<T>(work: (repositories: Repositories) => ResultAsync<T, DomainError>): ResultAsync<T, DomainError> {
    const execution = this.dataSource.transaction(async (manager) => {
      const result = await work(createTypeOrmRepositories(manager));
      if (!result.ok) throw new RollbackSignal(result.error);
      return result.value;
    });

    return ResultAsync.fromPromise(execution, (cause) =>
      cause instanceof RollbackSignal ? cause.domainError : persistenceError(),
    );
  }
}
