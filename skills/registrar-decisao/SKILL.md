---
name: registrar-decisao
description: Cria ou atualiza uma ADR (Architecture Decision Record) em knowledge/arquitetura/adr/. Use quando houver decisão estrutural, troca de tecnologia, regra que contradiz algo existente ou decisão do cliente que muda a arquitetura.
---

# Registrar decisão (ADR)

1. Veja o próximo número: `ls knowledge/arquitetura/adr/`.
2. Copie `template.md` desta pasta para `knowledge/arquitetura/adr/NNNN-titulo-em-kebab.md`.
3. Preencha: contexto (o problema, com fatos), decisão (o que **fazemos**), alternativas com o motivo do descarte, consequências (inclusive as negativas) e pendências.
4. Status:
   - `proposta`: o arquiteto sugere e ainda falta o OK do usuário;
   - `aceita`: o usuário decidiu ou é consequência direta de algo aceito;
   - `substituída por NNNN`: marque também na ADR antiga.
5. Se veio do cliente, adicione uma linha datada em `knowledge/produto/decisoes-do-cliente.md`.
6. Rode `npm run rag:index`.
