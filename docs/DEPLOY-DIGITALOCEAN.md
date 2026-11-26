# Despliegue en DigitalOcean (App Platform)

Este es el despliegue activo. El porqué está en el [ADR 006](adr/006-digitalocean-app-platform.md); la alternativa en AWS, en [DEPLOY.md](DEPLOY.md).

```
Usuario ──HTTPS──▶ App Platform (CDN + TLS) ──/*──────▶ sitio estático (SPA React)
                                            └──/api/*──▶ servicio NestJS ──TLS──▶ PostgreSQL 16
                                                              └─────────▶ Pasarela de pagos
```

Toda la app está descrita en [`.do/app.yaml`](../.do/app.yaml):

| Componente | Tipo | Qué hace |
|---|---|---|
| `web` | Static site | Compila el SPA (`npm run build`) e inyecta la CSP |
| `api` | Service | NestJS en Node 22. Health check en `/api/v1/health` |
| `migrate` | Job `PRE_DEPLOY` | Migraciones + seed antes de cada despliegue (idempotentes) |
| `db` | Clúster PostgreSQL 16 | Administrado, backups diarios, firewall solo para la app. Credenciales y CA inyectadas por App Platform |

## 1. Requisitos (una sola vez)

1. Crea una cuenta en DigitalOcean.
2. Crea un token de API: **API → Tokens → Generate New Token** (permisos *read* y *write*).
3. Instala y autentica la CLI. El token se pega en la terminal, nunca en un archivo del repo:
   ```bash
   brew install doctl
   doctl auth init
   ```
4. Ten `backend/.env` con las llaves del sandbox (ver `backend/.env.example`).
5. Crea el clúster PostgreSQL (unos 5 minutos):
   ```bash
   doctl databases create card-checkout-db --engine pg --version 16 --region nyc1 \
     --size db-s-1vcpu-1gb --num-nodes 1 --wait
   ```
   No se usa la BD *dev* de App Platform: en PostgreSQL 15+ su usuario no puede crear tablas ni esquemas.

## 2. Desplegar

```bash
./scripts/deploy-digitalocean.sh
```

El script hace lo siguiente:
1. Copia `.do/app.yaml` a un archivo temporal (permisos 600, fuera del repo).
2. Reemplaza los marcadores `__VARIABLE__` con las llaves de `backend/.env`.
3. Crea la app en el proyecto `card-checkout-app`, o la actualiza si ya existe, y espera a que el despliegue termine.
4. Restringe el firewall del clúster para que solo acepte conexiones de la app.

Las llaves privadas quedan como variables `SECRET`, cifradas por DigitalOcean.

El primer despliegue tarda unos 5 minutos. App Platform clona el repo público (rama `main`), así que **los cambios se publican al hacer push y volver a correr el script**.

## 3. Verificar

```bash
URL=$(doctl apps list --format DefaultIngress --no-header)
curl -s "$URL/api/v1/health"                    # {"status":"ok",...}
curl -s "$URL/api/v1/products" | head -c 300    # catálogo con stock
curl -sI "$URL/api/v1/products" | grep -iE "strict-transport|content-security|cache-control"
```

- La app queda en `$URL` y Swagger en `$URL/api/v1/docs`.
- Para ver los logs: `doctl apps logs <app-id> api --type run` (o `--type deploy` para el job de migraciones).

## Costos

| Recurso | USD/mes |
|---|---|
| Servicio `api` (512 MB) | 5 |
| Clúster PostgreSQL 16 (1 GB) | 15 |
| Sitio estático | 0 |

Las cuentas nuevas suelen recibir créditos promocionales. El cobro es por hora, así que un par de días de evaluación cuesta centavos.

## Eliminar todo

```bash
doctl apps delete $(doctl apps list --format ID --no-header)
doctl databases delete $(doctl databases list --format ID --no-header)
```
