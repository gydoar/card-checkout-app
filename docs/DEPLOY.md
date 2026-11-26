# Despliegue en AWS (alternativa)

> El despliegue activo está en DigitalOcean: [DEPLOY-DIGITALOCEAN.md](DEPLOY-DIGITALOCEAN.md). Esta guía queda lista para cuando se use AWS.

Toda la infraestructura está en [`/infra`](../infra) (AWS CDK, TypeScript). Un solo comando crea:

```
Usuario ──HTTPS──▶ CloudFront ──/*────────▶ S3 privado (SPA)
                        └─────/api/*──▶ API Gateway ──▶ Lambda NestJS ──▶ RDS PostgreSQL
                                                             └──NAT──▶ Pasarela de pagos
```

## 1. Requisitos (una sola vez)

1. **Cuenta de AWS.** Créala en <https://aws.amazon.com/free>. Todo lo que se usa entra en la capa gratuita (ver costos al final).
2. **Usuario para desplegar.** En IAM, crea un usuario con acceso programático y la política `AdministratorAccess` (solo para esta prueba; en producción se usaría un rol con permisos mínimos y OIDC desde GitHub Actions).
3. **AWS CLI v2** y credenciales:
   ```bash
   brew install awscli        # macOS
   aws configure              # Access key, Secret key, región: us-east-1
   aws sts get-caller-identity
   ```
4. **Node.js 22** (`.nvmrc`).

## 2. Secreto con las llaves de la pasarela

Las llaves **no** se versionan ni viajan en la plantilla de CloudFormation. Con `backend/.env` completo:

```bash
./scripts/create-gateway-secret.sh            # crea card-checkout/payment-gateway en Secrets Manager
```

## 3. Construir y desplegar

```bash
# Backend: dist + dependencias de producción + CAs de RDS -> backend/.lambda
(cd backend && npm ci && npm run package:lambda)

# Frontend: build estático -> frontend/dist
(cd frontend && npm ci && npm run build)

# Infraestructura
cd infra && npm ci
npx cdk bootstrap                                                   # solo la primera vez por cuenta/región
PAYMENT_GATEWAY_BASE_URL="https://<sandbox-de-la-pasarela>/v1" npx cdk deploy
```

Al terminar (≈15 min la primera vez, por la creación de RDS), CDK imprime:

| Output | Qué es |
|--------|--------|
| `SiteUrl` | La aplicación |
| `ApiDocsUrl` | Swagger UI público (`/api/v1/docs`) |
| `ApiGatewayUrl` | La API directa, sin CDN |

Las migraciones y el seed corren solos en cada despliegue (Lambda `MigrateFunction`, disparada por un `Trigger` de CDK).

## 4. Verificar

```bash
curl -s "$SITE_URL/api/v1/health"          # {"status":"ok"}
curl -sI "$SITE_URL" | grep -iE "strict-transport|content-security|x-frame"
```

Y en <https://observatory.mozilla.org> con la `SiteUrl`.

## 5. CI/CD (opcional)

`.github/workflows/ci.yml` ya incluye un job `deploy`. Para activarlo:

1. Crea en IAM un *OIDC identity provider* para `token.actions.githubusercontent.com` y un rol que confíe en el repositorio.
2. En GitHub → *Settings → Variables*: `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION` y `PAYMENT_GATEWAY_BASE_URL`.

Sin esas variables el job se omite y el CI sigue funcionando.

## Costos estimados (us-east-1)

| Recurso | Capa gratuita (12 meses) | Después |
|---------|--------------------------|---------|
| RDS db.t4g.micro + 20 GB | 750 h/mes | ~USD 15/mes |
| NAT instance t3.micro | 750 h/mes | ~USD 8/mes |
| Lambda, API Gateway, CloudFront, S3 | Holgado para la prueba | Centavos |
| Secrets Manager (2 secretos) | — | ~USD 0.80/mes |

## Eliminar todo

```bash
cd infra && npx cdk destroy
aws secretsmanager delete-secret --secret-id card-checkout/payment-gateway --force-delete-without-recovery
```
