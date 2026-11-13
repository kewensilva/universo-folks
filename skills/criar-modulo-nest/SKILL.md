---
name: criar-modulo-nest
description: Cria um novo módulo de domínio na API NestJS (apps/api) já no padrão do projeto - module, controller com papéis, service com auditoria e isolamento multi-tenant, DTOs validados e teste. Use ao iniciar qualquer domínio novo da API.
---

# Criar módulo NestJS no padrão do projeto

## Passos
1. Confirme com o `arquiteto-software` se é um módulo novo ou se cabe em um existente (`knowledge/arquitetura/visao-tecnica.md`).
2. Gere o esqueleto:
   ```bash
   node skills/criar-modulo-nest/scaffold.mjs <nome-kebab> [--tenant]
   # ex.: node skills/criar-modulo-nest/scaffold.mjs trilhas-obrigatorias --tenant
   ```
   - `--tenant`: rotas em `companies/:tenant/<nome>`, com `resolveTenant` e `@Roles('ADMIN_CLIENTE','MASTER_FOLKS')`.
   - Sem a flag: rotas em `master/<nome>`, com `@Roles('MASTER_FOLKS')`.
3. Registre o módulo no `app.module.ts`.
4. Implemente as regras **reutilizando** os serviços centrais (Access, Entitlements, Seats, Gamification). Nunca reimplemente.
5. Complete o teste gerado com os critérios de aceite; o `qa-testes` cobre o e2e.
6. `npm run gates`.

## O que o template já garante
- Toda escrita chama `audit.log`.
- O service recebe `AuthUser` e resolve o tenant num único ponto.
- Os DTOs usam class-validator com mensagens em pt-BR.
