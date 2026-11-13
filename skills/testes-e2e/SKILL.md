---
name: testes-e2e
description: Monta e roda testes end-to-end da API contra um banco PostgreSQL isolado e APIs externas simuladas - cria banco de teste descartável, aplica migrações e seed, sobe a API apontando para ele e executa o roteiro de verificações. Use para validar regras de negócio de ponta a ponta antes de entregar.
---

# Testes e2e com banco isolado

## Regras
- **Nunca** teste no banco de dev nem no do usuário. Cada execução usa um banco `universo_folks_test_<sufixo>`.
- Só remova bancos com prefixo `universo_folks_test_` que **esta tarefa** criou, e só com `--confirmar`.
- O login tem rate limit (10/min por IP): faça login uma vez por perfil e reaproveite o token.
- Antes de culpar o código, confira se o teste não tropeçou em outra validação (ex.: um nome curto barrado pelo DTO).

## Passos
1. Criar o banco, aplicar as migrações e o seed (rodar dentro de `apps/api`):
   ```bash
   bash ../../skills/testes-e2e/banco-teste.sh criar cotas   # -> universo_folks_test_cotas
   ```
2. Subir a API apontando para ele (em segundo plano):
   ```bash
   DATABASE_URL=postgresql://folks:folks@localhost:5433/universo_folks_test_cotas?schema=public node dist/main.js
   ```
   APIs externas? Suba um mock a partir de `templates/mock-api.mjs` e passe `*_API_URL` apontando para ele.
3. Escreva o roteiro a partir de `templates/roteiro.mjs`: um `ok(cond, 'descrição em pt-BR', detalhe)` por critério de aceite.
4. Rode e reporte **N/N verificações** e o que **não** foi coberto.
5. Limpeza (opcional): `bash ../../skills/testes-e2e/banco-teste.sh remover universo_folks_test_cotas --confirmar`.
