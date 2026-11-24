#!/usr/bin/env bash
# Crea (o actualiza) en AWS Secrets Manager el secreto con las llaves de la pasarela,
# leyéndolas de backend/.env. Las llaves nunca se escriben en el repositorio ni en CDK.
#
# Uso: ./scripts/create-gateway-secret.sh [nombre-del-secreto]
set -euo pipefail

SECRET_NAME="${1:-card-checkout/payment-gateway}"
ENV_FILE="$(dirname "$0")/../backend/.env"
[[ -f "$ENV_FILE" ]] || { echo "No existe $ENV_FILE (copia backend/.env.example y complétalo)"; exit 1; }

read_var() { grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-; }

SECRET_JSON=$(python3 -c 'import json,sys; print(json.dumps(dict(zip(sys.argv[1::2], sys.argv[2::2]))))' \
  PAYMENT_GATEWAY_PUBLIC_KEY "$(read_var PAYMENT_GATEWAY_PUBLIC_KEY)" \
  PAYMENT_GATEWAY_PRIVATE_KEY "$(read_var PAYMENT_GATEWAY_PRIVATE_KEY)" \
  PAYMENT_GATEWAY_INTEGRITY_SECRET "$(read_var PAYMENT_GATEWAY_INTEGRITY_SECRET)" \
  PAYMENT_GATEWAY_EVENTS_SECRET "$(read_var PAYMENT_GATEWAY_EVENTS_SECRET)")

if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "$SECRET_JSON" >/dev/null
  echo "Secreto actualizado: $SECRET_NAME"
else
  aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "$SECRET_JSON" \
    --description "Llaves sandbox de la pasarela de pagos (card-checkout-app)" >/dev/null
  echo "Secreto creado: $SECRET_NAME"
fi
