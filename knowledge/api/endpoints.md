# Catálogo de endpoints (referência da v0)

> tags: endpoints, rotas, api, contrato | fonte: backend/ (v0) — Swagger em /docs

## Auth e conta
- `POST /auth/register` (com `birthDate`), `login`, `refresh`, `logout`, `password/forgot`, `password/reset` (também aceita convite), `switch-context`, `join-company`, `change-password`, `impersonate` (MASTER).
- `GET/PATCH /me`, `GET /me/entitlements`, `GET/PATCH /me/preferences`, `POST /me/devices`, `POST /me/delete-account`, `GET /me/progress`, `GET/PUT /me/hangar`, `GET /me/company`, `POST /me/company/leave`, `GET /me/certificates`.

## Aluno
- `GET /billing/tiers` (público): planos de acesso ativos (Básico, Premium, Premium Plus) com galáxias e preços B2C ativos, para a tela de assinatura. `GET /billing/plans` lista só os preços ativos.
- `GET /catalog/home|categories|planets|planets/{slug}|assignments|search`.
- `GET /learning/me/snapshot`, `GET /learning/courses/{id}/trail`, `GET /learning/lessons/{id}`.
- `POST /learning/lessons/{id}/complete|video-progress|practice|practice-result`.
- Resposta de questão (`practice`, `exam-attempts/{id}/submit`, `infinite/finish`): `{questionId, optionIds | value | sequence | pairs | assignments | simulator, timeMs?}`. O campo depende do tipo (ver `knowledge/produto/tipos-de-questao-e-widgets.md`).
- `POST /learning/courses/{id}/infinite/start|finish`, `POST /learning/courses/{id}/exam/start`, `POST /learning/exam-attempts/{id}/submit`.
- `PUT /learning/course-states/{courseId}`, `PUT /learning/games/{gameId}/state`, `POST /learning/games/{gameId}/sessions|jam/start`.

## Empresa (`/companies/{me|id}`)
- `GET /`, `PATCH /settings` (sem cotas).
- `departments`, `members` (+ `bulk`, `resend-invite`), `people` (com situação), `reminders`, `planets/{id}` (liberação), `assignments` (+ `order`), `engagement?mode=week|month`, `report.csv`.

## MASTER
- `master/masters`, `master/tenants` (+ `settings` com cotas, `join-code`), `master/users`, `master/settings`, `master/api-tokens`.
- `master/content/*`: CRUD; `import/planet`, `import/catalog`; `vimeo/status|folders|sync`; `courses/{id}/vimeo/link-folder`.
- `master/certificate-templates`, `master/interactive/packages`.
- `master/billing/plans|subscriptions|payments|tenants/{id}/asaas-contract`.
- `dashboards/master`, `master/overview`, `master/financial-by-client`, `master/report.csv`.

## Webhooks e integrações
- `POST /billing/webhooks/revenuecat`, `POST /billing/webhooks/asaas`, `GET /billing/webhooks/admob/ssv`.
- `/xapi/*` (LRS), `/interactive/*`, `POST /mcp`.

## Importação de conteúdo (MASTER)
- `GET /master/content/imports/schema`, `POST /master/content/imports`, `POST /master/content/imports/upload`, `GET /master/content/imports[/{id}]`, `GET|PUT /master/content/imports/{id}/normalized`, `POST /master/content/imports/{id}/plan`, `POST /master/content/imports/{id}/apply`, `DELETE /master/content/imports/{id}`.
- MCP: `content_import_format`, `preview_content_import`, `fix_content_import`, `apply_content_import`.
