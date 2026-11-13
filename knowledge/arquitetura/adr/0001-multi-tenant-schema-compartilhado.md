# ADR 0001 — Multi-tenant com schema compartilhado

> tags: adr, multi-tenant, isolamento, tenant_id, segurança | status: aceita | data: 2026-11-09

## Contexto
Muitas empresas usam a mesma plataforma, e o conteúdo é global (criado pelo MASTER). É preciso isolar com rigor os dados de cada empresa.

## Decisão
- **Um schema compartilhado**, com `tenant_id` nas tabelas da empresa.
- O conteúdo é global; cada tenant só "liga/desliga" o que os seus colaboradores veem.
- **Ponto único de resolução** do tenant: `AccessService.resolveTenant(user, param)`.
  - O MASTER informa o tenant (`/companies/{id}`).
  - O ADMIN sempre opera no próprio tenant (`/companies/me`); qualquer outro id é negado.

## Alternativas descartadas
- Schema por tenant: complexidade de migração com centenas de empresas.
- Banco por tenant: custo operacional.

## Consequências
- Todo service de empresa **deve** chamar `resolveTenant`. O revisor e o agente de segurança checam isso.
- Endurecimento futuro: Row-Level Security no Postgres como segunda camada.
