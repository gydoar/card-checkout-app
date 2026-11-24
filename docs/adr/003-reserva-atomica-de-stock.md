# ADR 003 — Reserva atómica de stock al crear la transacción

**Contexto.** Si el stock solo se descuenta cuando el pago se aprueba, dos clientes pueden pagar la última unidad y uno de ellos queda cobrado sin producto.

**Decisión.**
- Al crear la transacción (PENDING) se **reserva** el stock con un `UPDATE` condicional atómico:
  `UPDATE products SET stock = stock - :q WHERE id = :id AND stock >= :q`. Si afecta 0 filas → `409 INSUFFICIENT_STOCK`.
- La reserva, el cliente, la transacción y la entrega se crean en **una sola transacción SQL** (unidad de trabajo). Si algo falla, el ROLLBACK devuelve el stock.
- Pago **aprobado** → la entrega pasa a `ASSIGNED` (el producto queda asignado al cliente). Pago **rechazado/anulado/error** → se libera el stock y la entrega pasa a `CANCELLED`.
- La finalización es condicional (`WHERE status = 'PENDING'`): si el webhook y el polling llegan a la vez, solo uno aplica los efectos y el stock nunca se libera dos veces.
- La BD refuerza la regla con `CHECK (stock >= 0)`.

**Consecuencias.**
- ✅ Probado con 10 compras concurrentes sobre 5 unidades → exactamente 5 ganan (`typeorm-persistence.spec.ts`).
- ⚠️ Un pago que quedara PENDING para siempre mantendría la reserva. Mejora futura: un job que expire las reservas viejas (existe el índice parcial `idx_transactions_pending` para eso).
