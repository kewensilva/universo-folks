---
name: migracao-prisma-segura
description: Cria e aplica migrações Prisma/PostgreSQL de forma segura e não interativa - gera o SQL por diff contra o banco de dev, adiciona backfill, revisa, aplica com migrate deploy e confirma sincronização. Use para qualquer mudança em schema.prisma. Nunca usa migrate reset nem edita migração aplicada.
---

# Migração Prisma segura

> Por que esta skill existe: o `prisma migrate dev` é interativo e **falha** neste ambiente quando há avisos, e o `migrate reset` apaga dados. Veja os aprendizados em `knowledge/aprendizados/`.

## Passos
1. Edite `prisma/schema.prisma` e rode `npx prisma format`.
2. Gere o SQL do incremento **contra o banco de dev** (nunca contra shadow DB improvisado):
   ```bash
   bash skills/migracao-prisma-segura/gerar.sh <nome_em_snake_case>
   ```
   O script cria `prisma/migrations/<timestamp>_<nome>/migration.sql` e mostra o conteúdo.
3. **Revise o SQL à mão:**
   - `DROP` inesperado? Pare e investigue.
   - Coluna `NOT NULL` ou `UNIQUE` nova em tabela com dados? Adicione um **backfill antes** da constraint, no mesmo arquivo.
   - Renomeação aparece como DROP + ADD? Use `@map` no schema para manter a coluna.
   - `ALTER TYPE ... ADD VALUE` (enum) não roda dentro de transação junto com o uso do valor; mantenha separado.
4. Aplique: `npx prisma migrate deploy`.
5. Confirme a sincronização (precisa sair 0):
   ```bash
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
   ```
6. `npx prisma generate` e `npm run gates`.
7. Atualize `knowledge/dominio/modelo-de-dados.md` se mudou entidade ou regra.

## Proibido (o hook bloqueia)
`prisma migrate reset`, `db push --force-reset`, `DROP DATABASE`, `DROP SCHEMA ... CASCADE` em bancos que você não criou nesta tarefa, e editar migração já aplicada.
