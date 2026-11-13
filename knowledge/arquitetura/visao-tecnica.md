# Visão técnica

> tags: arquitetura, stack, monorepo, módulos, camadas | ver também: adr/

## Stack
- **API:** Node.js 22+, TypeScript, NestJS 11, Prisma 6, PostgreSQL 16, Zod (schemas compartilhados com o MCP) e class-validator (DTOs).
- **Web:** Next.js 16 (App Router) + Tailwind 4 + TanStack Query, com o visual do protótipo (ADR 0012).
- **App:** React Native com Expo SDK 58 + Expo Router, publicado na App Store e no Google Play via EAS (ADR 0012).
- **Infra:** VPS com Docker Compose + Caddy (HTTPS) + backup diário fora da VPS. Storage S3/R2 + CDN em produção.

## Monorepo
```
apps/api        NestJS (módulos por domínio)
apps/web        Next.js: /master, /empresa, /estudar + BFF de sessão (/api/sessao)
apps/mobile     Expo (instalação isolada, fora dos workspaces da raiz)
packages/shared cliente da API, sessão/perfis (areaFor), tokens de design, formatação, tipos das questões
packages/content-ingest  importação de conteúdo (folks.content/v1) e correção por tipo de questão
```

## Módulos da API (por domínio)
| Módulo | Responsabilidade |
|---|---|
| access | Isolamento multi-tenant (`resolveTenant`), regra de acesso a conteúdo, entitlements (plano), cotas de licença, regra de uma empresa por pessoa |
| auth | Login, refresh com rotação, troca de contexto, convite, nova senha, "ver como" |
| master | MASTERs, tenants e parametrização, usuários B2C, configurações gerais |
| companies | Departamentos, pessoas, convites, liberação de planetas, trilhas obrigatórias, engajamento, CSV |
| content | CRUD de conteúdo, builder transacional, importador do catálogo do protótipo |
| catalog | Telas do aluno (início, planetas, busca, trilhas obrigatórias) |
| learning | Trilha, aula, vídeo (anti-pulo), prática (banco ou gerada), infinita, jogos, desafio final |
| certificates | Emissão, templates, verificação pública |
| gamification | XP com teto, nível, jornada, hangar, eventos de engajamento |
| billing | Planos, RevenueCat, Asaas, AdMob SSV, lançamentos manuais |
| dashboards | MASTER, empresa e aluno |
| interactive | SCORM/xAPI/cmi5 + LRS embutido |
| vimeo | Conta, pastas, metadados, privacidade do embed |
| mcp | Servidor MCP (HTTP `/mcp` + stdio) para o Claude criar conteúdo |
| notifications | Lembrete diário (push) |
| email | Resend: convite, nova senha, lembrete |

## Padrões transversais
- **Guards globais:** throttler → JWT (revalida usuário e vínculo a cada request; bloqueia escrita no "ver como") → papéis (`@Roles`).
- **Erros:** mensagens em pt-BR prontas para o usuário; códigos de negócio em `error` (`daily_limit`, `other_company`, `license_limit`, `PREMIUM_REQUIRED`).
- **Auditoria:** `AuditService.log` em toda ação administrativa, com `via` api/mcp.
- **Idempotência:** webhooks gravam `WebhookEvent(provider, externalId)` antes de processar.
- **Transações:** builders de conteúdo e importações são transacionais; I/O externo (Vimeo) acontece **antes** da transação.
