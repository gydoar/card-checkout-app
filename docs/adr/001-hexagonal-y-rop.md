# ADR 001 — Arquitectura hexagonal + Railway Oriented Programming

**Contexto.** La lógica de pago debe poder probarse sin base de datos ni red, y la prueba pide explícitamente no poner lógica de negocio en los controladores.

**Decisión.**
- Tres capas: `domain` (entidades y reglas puras), `application` (puertos + casos de uso) e `infrastructure` (adaptadores: HTTP, TypeORM, pasarela).
- Los casos de uso son **clases TypeScript puras, sin decoradores de Nest**. Nest solo se usa como *composition root* (`checkout.module.ts`) y como adaptador HTTP.
- Errores esperados como valores: `Result<T, E>` / `ResultAsync<T, E>` propios (~120 líneas, 100 % cubiertos). Los pasos se encadenan con `andThen`; el primer error "desvía el tren".
- La conversión excepción → `Err` ocurre en **una sola frontera** por tipo de adaptador (`fromRepository`, `request` del adaptador HTTP, `TypeOrmUnitOfWork`).

**Consecuencias.**
- ✅ Los casos de uso se prueban con adaptadores en memoria (`backend/test/fakes`) en milisegundos.
- ✅ Cambiar de pasarela = escribir otro adaptador de `PaymentGateway`.
- ✅ Los errores de negocio son parte de la firma: el compilador obliga a manejarlos.
- ⚠️ Se escribió un `Result` propio en lugar de usar `neverthrow`: menos dependencias y el patrón queda visible para el evaluador; a cambio, hay que mantenerlo.
