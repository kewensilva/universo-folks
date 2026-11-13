#!/usr/bin/env bash
# Gera a migração incremental por diff contra o banco de dev (não interativo).
# Uso: bash skills/migracao-prisma-segura/gerar.sh nome_da_migracao   (rodar dentro de apps/api)
set -euo pipefail
NAME="${1:?informe o nome da migração em snake_case}"
[[ "$NAME" =~ ^[a-z0-9_]+$ ]] || { echo "nome inválido: use snake_case"; exit 1; }
[ -f prisma/schema.prisma ] || { echo "rode dentro do app que tem prisma/schema.prisma (ex.: apps/api)"; exit 1; }
if [ -z "${DATABASE_URL:-}" ] && [ -f .env ]; then
  # carrega só DATABASE_URL, sem imprimir segredos
  DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
fi
: "${DATABASE_URL:?DATABASE_URL não definido}"
# timestamp sempre POSTERIOR à última migração existente (a ordem de aplicação é lexicográfica)
NOW="$(date -u +%Y%m%d%H%M%S)"
LAST="$(ls prisma/migrations 2>/dev/null | grep -E '^[0-9]{14}_' | sort | tail -1 | cut -c1-14)"
if [ -n "$LAST" ] && [ "$NOW" -le "$LAST" ]; then NOW=$((LAST + 1)); fi
DIR="prisma/migrations/${NOW}_${NAME}"
SQL="$(npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>/dev/null | grep -v '^For more information' || true)"
if [ -z "$(echo "$SQL" | grep -v '^--' | tr -d '[:space:]')" ] || echo "$SQL" | grep -q 'This is an empty migration'; then
  echo "Nada a migrar: banco de dev já está em sincronia com o schema."; exit 0
fi
mkdir -p "$DIR"
printf -- '-- %s\n%s\n' "$NAME" "$SQL" > "$DIR/migration.sql"
echo "✔ criado $DIR/migration.sql — REVISE antes de aplicar:"
echo "------------------------------------------------------------"
cat "$DIR/migration.sql"
echo "------------------------------------------------------------"
if grep -qiE '\bDROP (TABLE|COLUMN|SCHEMA|DATABASE)\b' "$DIR/migration.sql"; then
  echo "⚠ ATENÇÃO: a migração contém DROP. Confirme que é intencional (renomeação? use @map)."
fi
