#!/usr/bin/env bash
# Bancos de teste descartáveis (container Postgres do projeto, porta 5433).
#   criar <sufixo>                -> cria universo_folks_test_<sufixo>, aplica migrações e seed demo
#   listar                        -> lista bancos de teste
#   remover <nome> --confirmar    -> remove SOMENTE bancos universo_folks_test_*
set -euo pipefail
PSQL=(docker compose exec -T postgres psql -U folks -d postgres -v ON_ERROR_STOP=1)
cmd="${1:-}"
case "$cmd" in
  criar)
    suf="${2:?informe um sufixo (letras/números)}"; [[ "$suf" =~ ^[a-z0-9_]+$ ]] || { echo "sufixo inválido"; exit 1; }
    db="universo_folks_test_${suf}"
    "${PSQL[@]}" -c "CREATE DATABASE ${db}" >/dev/null
    export DATABASE_URL="postgresql://folks:folks@localhost:5433/${db}?schema=public"
    npx prisma migrate deploy >/dev/null
    SEED_DEMO=true npm run -s db:seed
    echo "✔ ${db} pronto -> DATABASE_URL=${DATABASE_URL}"
    ;;
  listar)
    "${PSQL[@]}" -tAc "SELECT datname FROM pg_database WHERE datname LIKE 'universo_folks_test%' ORDER BY 1"
    ;;
  remover)
    db="${2:?informe o nome}"
    [[ "$db" =~ ^universo_folks_test_[a-z0-9_]+$ ]] || { echo "recusado: só bancos universo_folks_test_<sufixo>"; exit 1; }
    [ "${3:-}" = "--confirmar" ] || { echo "recusado: passe --confirmar"; exit 1; }
    "${PSQL[@]}" -c "DROP DATABASE ${db}"
    ;;
  *) echo "uso: banco-teste.sh criar <sufixo> | listar | remover <nome> --confirmar"; exit 1 ;;
esac
