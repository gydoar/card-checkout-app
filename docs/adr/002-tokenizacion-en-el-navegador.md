# ADR 002 — La tarjeta se tokeniza en el navegador

**Contexto.** Los datos de tarjeta (PAN, CVC) son el activo más sensible del sistema. Cualquier servidor que los reciba entra en el alcance de PCI-DSS.

**Decisión.**
- El navegador envía la tarjeta **directamente** a `POST /tokens/cards` de la pasarela con la **llave pública**, y a nuestro backend solo llega el token (`tok_...`).
- En el frontend, los datos de tarjeta viven solo en el estado local del formulario. La tokenización ocurre en un hook (`useConfirmPaymentDetails`), **fuera de Redux**: un `createAsyncThunk` copiaría el argumento en `action.meta.arg` y el número quedaría visible en Redux DevTools.
- A Redux solo llega `{ brand, lastFour, holder, installments }` + el token. El token no se persiste en `localStorage`.
- El backend rechaza en el DTO cualquier `cardToken` que no tenga formato de token (`^tok_…`), así que un PAN enviado por error recibe un 400 y nunca se procesa ni se registra.

**Consecuencias.**
- ✅ El backend nunca ve, registra ni almacena un número de tarjeta.
- ✅ El CSP del frontend autoriza `connect-src` solo hacia el propio dominio y el origen de la pasarela.
- ⚠️ Tras un refresh en el resumen el usuario debe volver a ingresar la tarjeta (a propósito: se le explica con un aviso).
