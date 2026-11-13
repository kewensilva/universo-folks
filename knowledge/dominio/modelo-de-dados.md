# Modelo de dados (visão por agregados)

> tags: banco, schema, prisma, entidades, modelo de dados, tabelas | referência: backend/prisma/schema.prisma (v0)

## Identidade e acesso
- `User`: pessoa. `platformRole` (MASTER_FOLKS | USER), `birthDate`, `tipsSeen`, `asaasCustomerId`. A senha é nula enquanto o convite não foi aceito.
- `RefreshToken` (rotação; guarda o contexto), `ApiToken` (PAT para o MCP), `OneTimeToken` (convite e nova senha), `DeviceToken` (push).

## Tenancy
- `Tenant` (B2B/B2G, `joinCode`, status, visual, `asaasCustomerId`) e `TenantSettings`:
  - cotas `maxCollaborators` (coluna `max_users`) e `maxAdmins`;
  - `passingScore`, tentativas, fluxo sequencial, contrato.
- `Membership`:
  - papel (ADMIN_CLIENTE | COLABORADOR_CLIENTE) e status (INVITED | ACTIVE | DISABLED);
  - **`oneCompanyKey` único** (= userId quando INVITED/ACTIVE) garante "uma empresa por pessoa".
- `Department` (com hierarquia), `MembershipDepartment` (N:N).
- `TenantPlanetAccess` + `TenantPlanetDepartment` (liberação) e `Assignment` (trilha obrigatória).

## Conteúdo (global, criado pelo MASTER)
- `StudyCategory` → `Planet` (visual, tier) → `Course` (code, meta, badge, game, drillLabel) → `Unit` (accessTier, themeColor) → `Lesson` (tipo, content com slides/widgets/check, generators + generatorSpecs, questionCount = questões por rodada, Vimeo, thumbnail) → `Question` (type, data, media, methodology, timeLimitMs) / `QuestionOption` (só nas questões de escolha).
- Tipos de questão e onde fica a resposta de cada um: ADR 0011 e `knowledge/produto/tipos-de-questao-e-widgets.md`.
- `Exam` (BANK ou GENERATED). `InteractivePackage`, `ScormRuntimeState`, `XapiStatement`, `XapiDocument`.
- **Catálogo do MASTER (ADR 0013):** `Methodology` (code = `Question.methodology`, answerFormats, guidance, status ACTIVE/INACTIVE/COMING_SOON, isSystem) e `TrailTemplate` (code, structure JSON, isActive) ← `Course.trailTemplateId` (opcional, SET NULL ao excluir).

## Progresso e engajamento
- `Enrollment` (por pessoa e curso), `LessonProgress`, `PracticeAttempt`, `ExamAttempt`, `InfiniteRecord`, `CourseState`, `GameState`.
- `ActivityEvent`: base do engajamento. Guarda `tenantId` quando a pessoa estava no contexto da empresa.
- `UserGamification`, `XpEvent`, `DailyActivity`, `DailyAllowance` (limites do grátis), `AdReward`, `UserBadge`.

## Certificados
- `CertificateTemplate` (global ou da empresa) e `Certificate` (código público, snapshot dos dados).

## Financeiro
- `Plan` (preço): B2C/B2B/B2G; product ids da Apple, do Google e da web; `tierId` → plano de acesso que o preço libera (null = libera tudo).
- `PlanTier` (plano de acesso do aluno, ADR 0014): Básico, Premium, Premium Plus; `isDefault` (um só: quem não assina), `includesAllCategories`, `PlanTierCategory` (galáxias). Regra em `AccessService.planCoverage`.
- `Subscription`:
  - B2C usa `userId`; B2B usa `tenantId`;
  - provider: REVENUECAT | ASAAS | MANUAL...;
  - status: PENDING | ACTIVE | PAST_DUE...;
  - `amountCents` guarda o valor do contrato.
- `Payment`, `WebhookEvent` (idempotência por provider e externalId).

## Plataforma
- `PlatformSetting` (chave/valor das configurações gerais) e `AuditLog` (`via` api | mcp | system).
