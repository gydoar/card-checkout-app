#!/usr/bin/env bash
# Despliega (o actualiza) la app en DigitalOcean App Platform.
#
# Toma .do/app.yaml, reemplaza los marcadores __VARIABLE__ con las llaves de backend/.env
# en un archivo temporal (permisos 600, fuera del repo, se borra al terminar) y lo envía con doctl.
#
# Requisitos: doctl autenticado (`doctl auth init`) y backend/.env con las llaves del sandbox.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEMPLATE="$ROOT/.do/app.yaml"
ENV_FILE="$ROOT/backend/.env"
APP_NAME="card-checkout-app"

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

APP_ID="$(doctl apps list --format ID,Spec.Name --no-header | awk -v n="$APP_NAME" '$2 == n { print $1 }')"
if [ -z "$APP_ID" ]; then
  echo "Creando la app $APP_NAME..."
  doctl apps create --spec "$SPEC" --wait --format ID,DefaultIngress,ActiveDeployment.Phase
else
  echo "Actualizando la app $APP_NAME ($APP_ID)..."
  doctl apps update "$APP_ID" --spec "$SPEC" --wait --format ID,DefaultIngress,ActiveDeployment.Phase
fi
