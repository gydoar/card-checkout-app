# ADR 005 — AWS serverless con SPA y API bajo el mismo dominio

**Contexto.** Desplegar a bajo costo (capa gratuita), con HTTPS, cabeceras de seguridad y la menor superficie posible.

**Decisión.**
- **CloudFront** sirve el SPA desde un **S3 privado** (Origin Access Control) y enruta `/api/*` a **API Gateway HTTP API → Lambda (NestJS)**. Un solo dominio: no hace falta CORS y la CSP queda en `connect-src 'self' <pasarela>`.
- **Lambda arm64** dentro de una VPC privada. **RDS PostgreSQL 16** (db.t4g.micro) en subred aislada, cifrada y con TLS obligatorio; la Lambda valida el certificado con el bundle de CAs de RDS.
- Salida a internet (para llamar a la pasarela) con una **NAT instance t3.micro** en lugar de un NAT Gateway (~USD 32/mes).
- Secretos en **Secrets Manager**: la Lambda recibe solo identificadores y lee los valores al arrancar.
- **Migraciones + seed** con una Lambda ejecutada por un `Trigger` de CDK en cada despliegue.
- Todo en **AWS CDK (TypeScript)**, con tests sobre la plantilla generada.

**Consecuencias.**
- ✅ `cdk deploy` / `cdk destroy` levantan o eliminan todo el ambiente.
- ⚠️ Cold start de Lambda + Nest (~1-2 s en la primera petición). Aceptable para la prueba; se mitigaría con *provisioned concurrency*.
- ⚠️ Con el dominio `*.cloudfront.net` la política TLS la fija AWS; con un dominio propio se fijaría TLS 1.2+.
