# ADR 0005 — Questões do banco × exercícios gerados no app

> tags: adr, conteúdo, prática, prova, geradores, generated, bank, protótipo | status: aceita | data: 2026-11-09

## Contexto
No protótipo, os exercícios de tabuada, porcentagem e ouvido são **gerados no aparelho** (geradores `t1`, `p2b`, `pitch`...). Já o Feedback usa **questões escritas**.

## Decisão
- `questionSource = BANK`: questões no banco, corrigidas no servidor. É o **obrigatório para certificados com valor formal (B2B)**.
- `questionSource = GENERATED`: o app gera os exercícios e informa `{correct, total, xp}`. O servidor valida a ordem da trilha, o acesso Premium, a nota mínima e aplica o **teto de XP**.
- Os ids dos geradores só existem no app. Novos geradores exigem mudança no app.

## Risco aceito
Resultados GENERATED podem ser forjados. Mitigação: teto de XP e uso só em cursos sem certificado formal ("para a vida", com insígnia).
