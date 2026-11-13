# ADR 0003 — Uma pessoa só pode estar em uma empresa

> tags: adr, uma empresa por pessoa, colaborador em duas empresas, vínculo, membership, empresa, regra, one_company_key | status: aceita (decisão do cliente) | data: 2026-11-09

## Contexto
O protótipo previa uma empresa por pessoa. A v0 permitia várias (por causa do modo B2B/B2C). O cliente decidiu: **uma pessoa, uma empresa**.

## Decisão
- Coluna `memberships.one_company_key UUID UNIQUE`: igual a `user_id` quando o status é INVITED ou ACTIVE, e nula quando é DISABLED. **O banco garante a regra.**
- A aplicação checa antes (`assertNoOtherCompany`) e devolve `409 other_company` com mensagem clara.
- Todo caminho que cria ou reativa vínculo passa pela checagem: cadastro pela empresa, código, convite, primeiro ADMIN e reativação.
- `POST /me/company/leave` permite sair. O modo B2C continua disponível.

## Alternativa descartada
Índice parcial (`WHERE status <> 'DISABLED'`): o Prisma não modela índices parciais e tentaria removê-lo nas próximas migrações.
