# ADR 006 — Despliegue activo en DigitalOcean App Platform

**Contexto.** La cuenta de AWS quedó retenida en la verificación de cuentas nuevas, que bloquea EC2, RDS, Lambda y CloudFormation. Había que entregar el mismo día. La prueba acepta cualquier proveedor cloud.

**Decisión.**
- El despliegue público corre en **DigitalOcean App Platform**, descrito como código en [`.do/app.yaml`](../../.do/app.yaml):
  - un **sitio estático** para el SPA;
  - un **servicio** con NestJS;
  - un **job PRE_DEPLOY** con las migraciones y el seed;
  - un **clúster PostgreSQL 16** administrado, con firewall que solo admite la app.
- Se mantiene el modelo de **un solo dominio**: el router de App Platform envía `/api/*` al servicio y el resto al SPA. Así no hace falta CORS y la CSP sigue siendo `connect-src 'self' <pasarela>`.
- La conexión a la BD va por TLS y **valida el certificado** con la CA del clúster (`${db.CA_CERT}` → `DB_SSL_CA`).
- Las llaves de la pasarela entran como variables `SECRET`, cifradas por DigitalOcean. [`scripts/deploy-digitalocean.sh`](../../scripts/deploy-digitalocean.sh) las toma de `backend/.env` y las inserta en una copia temporal del spec, fuera del repo.
- La **CSP del SPA** se inyecta como `<meta>` al compilar, porque App Platform no permite cabeceras propias en sitios estáticos.
- La infraestructura **AWS CDK** ([ADR 005](005-aws-serverless-mismo-dominio.md)) sigue en el repo, probada y lista para `cdk deploy` cuando la cuenta se active. El código de la app es el mismo en ambos proveedores; solo cambia el adaptador de configuración.

**Consecuencias.**
- ✅ La app corre en un servidor Node persistente, sin *cold starts*.
- ✅ El mismo código funciona en los dos proveedores. Es la arquitectura hexagonal en la práctica: la nube es un detalle de infraestructura.
- ⚠️ Una CSP en `<meta>` no admite `frame-ancestors`. HSTS y el certificado TLS los pone App Platform.
- ⚠️ La BD *dev* de App Platform se descartó: en PostgreSQL 15+ su usuario no puede crear tablas ni esquemas. Se usa un clúster administrado (USD 15/mes), que además trae backups diarios.
