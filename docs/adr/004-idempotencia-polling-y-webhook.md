# ADR 004 — Idempotencia + polling + webhook

**Contexto.** El cobro es asíncrono (la pasarela responde PENDING y aprueba segundos después). Las redes móviles fallan y los usuarios refrescan o hacen doble clic.

**Decisión.**
- **Idempotency-Key** (UUID) obligatoria en `POST /transactions`, generada por el cliente una vez por intento de pago y persistida. Con la misma llave el servidor responde `200` con la transacción original, sin un segundo cobro. Misma llave con otra orden → `409 IDEMPOTENCY_CONFLICT`. La columna es `UNIQUE` en la BD.
- **Polling**: `GET /transactions/:id` sincroniza con la pasarela si la transacción sigue PENDING. El frontend consulta cada 2.5 s (hasta ~1 min) y sobrevive a un refresh: el id está en la URL y en el estado persistido.
- **Webhook** (`POST /webhooks/payment-events`): checksum SHA-256 verificado en tiempo constante antes de tocar la BD. Ambos caminos usan el mismo servicio de liquidación idempotente.
- **Anti-manipulación**: si la referencia o el monto que confirma la pasarela no coinciden con la orden, la transacción queda en `ERROR` y no se asigna el producto.
- Los **tokens de aceptación** de la pasarela son de un solo uso (lo detectamos probando contra el sandbox): no se cachean y el frontend pide unos nuevos justo antes de pagar.

**Consecuencias.**
- ✅ Funciona aunque el webhook no esté configurado (la cuenta sandbox es compartida).
- ✅ Doble clic, reintentos de red y refresh no generan cobros duplicados.
