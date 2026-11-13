# ADR 0002 — Contexto ativo no JWT (PLATFORM / TENANT / B2C)

> tags: adr, jwt, contexto, b2b, b2c, switch-context, autenticação | status: aceita | data: 2026-11-09

## Decisão
- O access token (15 min) carrega `mode`, `tid` (tenant), `mid` (vínculo) e `tr` (papel).
- O refresh token (30 dias, com rotação) guarda o contexto.
- `POST /auth/switch-context` alterna entre os modos disponíveis.
- O guard **revalida no banco** a cada request: usuário ativo, vínculo ativo e tenant ativo.
- Token de "ver como" tem `imp: true`, dura 30 minutos e só permite GET.

## Consequências
- O progresso é da **pessoa** (não duplica entre modos). Os dashboards da empresa só enxergam o conteúdo liberado ou atribuído por ela.
- XP e engajamento registram o `tenantId` só quando a atividade foi feita no contexto TENANT.
