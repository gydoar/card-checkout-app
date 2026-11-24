#!/usr/bin/env bash
# Empaqueta el backend para AWS Lambda en ./.lambda (lo consume /infra con CDK):
#   dist/ compilado + dependencias de producción + bundle de CAs de RDS (TLS verificado).
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=.lambda

npm run build
rm -rf "$OUT"
mkdir -p "$OUT/certs"
cp -R dist package.json package-lock.json "$OUT/"
(cd "$OUT" && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)

# Certificados oficiales de RDS para validar el servidor de base de datos
curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o "$OUT/certs/rds-global-bundle.pem"

# Los .map ayudan a depurar en CloudWatch; los tipos y docs no hacen falta en runtime
find "$OUT/node_modules" -type f \( -name '*.d.ts' -o -name '*.md' \) -delete

echo "Paquete Lambda listo en $OUT ($(du -sh "$OUT" | cut -f1))"
