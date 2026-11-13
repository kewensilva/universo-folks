# Nome de migração precisa ser posterior à última existente

> tags: aprendizado, prisma, migração, ordem, timestamp, hook | origem: incidente | data: 2026-11-10

## Regra
Ordem de migração é lexicográfica: o nome novo deve ser maior que todos os existentes; comando bloqueado = nada executado

## Contexto
Migrações criadas à mão com timestamps fictícios à frente do relógio; o gerador usava o horário UTC real

## O que estava errado
Gerar a pasta com date -u (ficou anterior às já existentes) e tentar renomear depois num comando que acabou bloqueado pelo hook (o mv não rodou e a migração foi aplicada com o nome antigo)

## O que é correto
O gerador usa max(agora, última+1). Nunca renomear migração já aplicada; e quando um comando composto é bloqueado por um hook, nenhuma parte dele rodou: conferir o estado antes de seguir
