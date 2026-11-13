# Zod 4: .partial() mantém os .default() e o PATCH reseta campos

> tags: aprendizado, zod, patch, api, validacao | origem: teste | data: 2026-11-13

## Regra
Todo schema de PATCH derivado de um schema de criação com .default() usa patchOf

## Contexto
Schemas de PATCH feitos com createSchema.partial() (metodologias, modelos de trilha, planos)

## O que estava errado
Usar create.omit(...).partial() para o PATCH: no Zod 4 um campo com .default() continua preenchido, então PATCH só com name gravava status ACTIVE, isActive true ou isDefault false

## O que é correto
Usar patchOf(schema) de backend/src/common/zod-partial.ts, que tira os defaults antes do partial; e testar no e2e que um PATCH parcial não muda outros campos
