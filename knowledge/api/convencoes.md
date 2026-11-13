# Convenções da API

> tags: api, rest, convenções, erros, paginação, autenticação, rotas

- Prefixo `/api`; exceções: `/mcp` e `/health`. Swagger em `/docs`.
- **Auth:** `Authorization: Bearer <access token>` (15 min); refresh em `/api/auth/refresh` com rotação. Token pessoal `fk_pat_...` só para o MCP.
- **Rotas por perfil:**
  - `/api/master/*` (MASTER);
  - `/api/companies/{me|tenantId}/*` (ADMIN usa `me`, MASTER usa o id);
  - `/api/catalog/*` e `/api/learning/*` (aluno);
  - `/api/me/*` (conta);
  - `/api/billing/*`;
  - `/api/dashboards/*`.
- **Erros:** `{ statusCode, message, error? }`. A `message` vem em pt-BR, pronta para mostrar ao usuário. `error` traz o código de negócio quando o app precisa reagir:

| HTTP | error | Quando |
|---|---|---|
| 409 | `daily_limit` | Rodada/jam do plano grátis acabou (traz `canWatchAd`) |
| 409 | `other_company` | A pessoa já pertence a outra empresa |
| 403 | `license_limit` | Cota de colaboradores ou administradores cheia (traz `role`) |
| 403 | `reason: PREMIUM_REQUIRED` | Etapa ou curso Premium |
| 409 | (Prisma P2002) | Registro duplicado |

- **Paginação:** `?page=&pageSize=&search=` → `{ items, total, page, pageSize, totalPages }`.
- **Validação:** DTO (class-validator) ou `ZodPipe` com schemas compartilhados. `whitelist` ligado: **campo desconhecido é descartado em silêncio**. Atenção ao renomear campos (veja os aprendizados).
- **Datas:** ISO 8601. "Dia" de engajamento, jornada e limites é sempre o dia em America/Sao_Paulo.
- **CSV:** `text/csv; charset=utf-8`, BOM + separador `;`.
