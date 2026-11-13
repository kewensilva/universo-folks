---
name: endpoint-multitenant
description: Checklist para criar ou alterar qualquer endpoint que toque dados de empresa (tenant) ou dependa de papel. Garante isolamento entre empresas, papéis corretos, regras centrais (cotas, uma empresa por pessoa, plano) e auditoria. Use em toda rota de /companies, /master e em mudanças de auth.
---

# Endpoint multi-tenant: checklist

## Rota e papel
- [ ] Rotas de empresa: `companies/:tenant/...`, com `:tenant` = `me` (ADMIN) ou uuid (MASTER).
- [ ] `@Roles('ADMIN_CLIENTE','MASTER_FOLKS')` (ou o papel certo). O COLABORADOR nunca acessa rotas de gestão.
- [ ] Rotas de aluno usam o contexto do token (`user.mode`, `user.tenantId`) e nunca recebem `tenantId` do cliente.

## Isolamento
- [ ] Primeira linha do service: `const tenantId = this.access.resolveTenant(user, param === 'me' ? undefined : param)`.
- [ ] Toda busca por id **também** filtra por `tenantId` (`findFirst({ where: { id, tenantId } })`).
- [ ] Relacionamentos recebidos no body (departmentIds, membershipId, planetId) são validados como pertencentes ao tenant.

## Regras centrais (sempre pelos serviços)
- [ ] Entrar/criar/reativar vínculo → `assertNoOtherCompany` + `SeatsService.assertAvailable(tenantId, role)`.
- [ ] Mudar o papel de alguém ativo → `SeatsService.assertAvailable` no papel de destino; manter pelo menos 1 ADMIN.
- [ ] Liberar conteúdo para o aluno → `AccessService` (planetWhere / courseAccess) e `EntitlementsService`.
- [ ] Concluir atividade → `GamificationService.recordActivity` (XP com teto + engajamento).

## Escrita
- [ ] `audit.log(user, '<entidade>.<ação>', ...)` com o tenantId.
- [ ] O "ver como" é somente leitura (o guard já bloqueia; não crie exceções).
- [ ] Erros em pt-BR, com código de negócio em `error` quando o app precisa reagir.

## Testes mínimos
- [ ] ADMIN da empresa A recebe 403 na empresa B.
- [ ] COLABORADOR recebe 403 na gestão.
- [ ] A regra de negócio do endpoint (limite, permissão, estado).
