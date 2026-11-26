#!/usr/bin/env bash
# Despliega (o actualiza) la app en DigitalOcean App Platform.
#
# Toma .do/app.yaml, reemplaza los marcadores __VARIABLE__ con las llaves de backend/.env
# en un archivo temporal (permisos 600, fuera del repo, se borra al terminar) y lo envía con doctl.
#
# Requisitos: doctl autenticado (`doctl auth init`), backend/.env con las llaves del sandbox
# y el clúster PostgreSQL "card-checkout-db" creado (ver docs/DEPLOY-DIGITALOCEAN.md).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/.do/app.yaml"
ENV_FILE="$ROOT/backend/.env"
APP_NAME="card-checkout-app"
PROJECT_NAME="card-checkout-app"
DB_CLUSTER="card-checkout-db"

command -v doctl >/dev/null || { echo "Instala doctl: brew install doctl" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "Falta $ENV_FILE" >&2; exit 1; }

SPEC="$(mktemp)"
chmod 600 "$SPEC"
trap 'rm -f "$SPEC"' EXIT

# Node lee el .env con el mismo parser que usa la app y falla si falta alguna llave
node - "$TEMPLATE" "$ENV_FILE" "$SPEC" <<'NODE'
const { readFileSync, writeFileSync } = require('node:fs');
const { parseEnv } = require('node:util');
const [template, envFile, out] = process.argv.slice(2);
const env = parseEnv(readFileSync(envFile, 'utf8'));
const spec = readFileSync(template, 'utf8').replace(/__([A-Z_]+)__/g, (_, key) => {
  const value = env[key]?.trim();
  if (!value) throw new Error(`Falta ${key} en backend/.env`);
  if (/["\\\n]/.test(value)) throw new Error(`${key} contiene caracteres no permitidos`);
  return value;
});
writeFileSync(out, spec);
NODE

DB_ID="$(doctl databases list --format ID,Name --no-header | awk -v n="$DB_CLUSTER" '$2 == n { print $1 }')"
[ -n "$DB_ID" ] || { echo "No existe el clúster $DB_CLUSTER (ver docs/DEPLOY-DIGITALOCEAN.md)" >&2; exit 1; }

APP_ID="$(doctl apps list --format ID,Spec.Name --no-header | awk -v n="$APP_NAME" '$2 == n { print $1 }')"
if [ -z "$APP_ID" ]; then
  # La app (y sus recursos) se asignan al proyecto dedicado, que se crea si no existe
  PROJECT_ID="$(doctl projects list --format ID,Name --no-header | awk -v n="$PROJECT_NAME" '$2 == n { print $1 }')"
  if [ -z "$PROJECT_ID" ]; then
    PROJECT_ID="$(doctl projects create --name "$PROJECT_NAME" --purpose "Web Application" --format ID --no-header)"
  fi
  echo "Creando la app $APP_NAME en el proyecto $PROJECT_NAME..."
  doctl apps create --spec "$SPEC" --project-id "$PROJECT_ID" --wait --format ID,DefaultIngress
else
  echo "Actualizando la app $APP_NAME ($APP_ID)..."
  doctl apps update "$APP_ID" --spec "$SPEC" --wait --format ID,DefaultIngress
fi

# Firewall de la BD: solo la app puede conectarse (idempotente)
APP_ID="$(doctl apps list --format ID,Spec.Name --no-header | awk -v n="$APP_NAME" '$2 == n { print $1 }')"
if ! doctl databases firewalls list "$DB_ID" | grep -q "app *$APP_ID"; then
  doctl databases firewalls append "$DB_ID" --rule "app:$APP_ID" >/dev/null
  echo "Firewall: la BD solo acepta conexiones de la app."
fi
