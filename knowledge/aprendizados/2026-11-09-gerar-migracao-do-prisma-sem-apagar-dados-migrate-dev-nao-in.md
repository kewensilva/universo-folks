# Gerar migração do Prisma sem apagar dados (migrate dev não interativo)

> tags: aprendizado, prisma, migração, banco, não interativo, migrate dev | origem: incidente | data: 2026-11-09

## Regra
Migração = diff contra o banco de dev + revisão manual + migrate deploy. Reset de banco só com consentimento explícito.

## Contexto
Criar migração do Prisma neste ambiente (agente sem terminal interativo) e com banco que já tem dados

## O que estava errado
Usar prisma migrate dev (falha: ambiente não interativo quando há avisos) ou recorrer a prisma migrate reset (apaga todos os dados; exige consentimento explícito do usuário)

## O que é correto
Gerar o SQL com prisma migrate diff --from-url <banco de dev> --to-schema-datamodel, revisar, adicionar backfill e aplicar com migrate deploy; conferir com --exit-code. Nunca usar shadow DB improvisado no banco postgres.
