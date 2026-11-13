# Query com tipo de interseção não é convertida pelo ValidationPipe

> tags: aprendizado, nest, validação, query, paginação | origem: teste | data: 2026-11-11

## Regra
Parâmetro de @Query() é sempre uma CLASSE com decorators; o harness:check bloqueia interseção de tipos em @Query().

## Contexto
GET /master/tenants dava 500 (take: "50" texto) ao ser usada pela web (2026-11-11); o mesmo erro já tinha acontecido na listagem de importações

## O que estava errado
@Query() q: PaginationQuery & { type?: string } — com interseção de tipos o Nest não sabe a classe, não aplica class-transformer e page/pageSize chegam como texto.

## O que é correto
Criar uma classe que estende PaginationQuery (TenantsQuery) com os campos extras decorados.
