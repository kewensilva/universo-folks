# ADR 0013 — Catálogo do MASTER: metodologias de prática e modelos de trilha

> tags: adr, metodologia, menu metodologia, personalização de trilha, modelo de trilha, estrutura da trilha, unidade, vídeo e prática, prática no fim, só prática, captura, voz, microfone, foto, câmera, em breve, claude, importação | status: aceita | data: 2026-11-13

## Contexto
O cliente pediu dois menus novos no painel do MASTER:
- **Metodologia:** como cada prática funciona (mito ou verdade, múltipla escolha, ligar pares… e, no futuro, simulação por voz no microfone e foto ou vídeo pela câmera).
- **Personalização de trilha:** como a trilha é estruturada. Exemplos dele: "unidade 1 vídeo e prática, unidade 2 vídeo e prática"; "unidades só com vídeo e a prática no final"; "sem vídeo, só prática".

Até aqui a metodologia era só um texto livre na questão (`methodology`) e a estrutura do curso vinha do jeito que o Claude montasse.

## Decisões do cliente (2026-11-13)
1. **Captura (voz, foto, vídeo):** por enquanto entra no catálogo como **"em breve"**. A captura, a guarda dos arquivos e a avaliação ficam para uma próxima etapa.
2. **Modelo de trilha:** o MASTER cria os modelos; ao pedir um curso, ele escolhe o modelo e o **Claude monta seguindo a estrutura**. A importação **avisa** quando o curso foge do modelo.
3. **Metodologia pode ser ativada e desativada.** Inativa não é oferecida ao Claude e a importação avisa se aparecer. O que já existe continua funcionando para os alunos.

## Decisão técnica
- **Tabelas:**
  - `methodologies`: `code` (é o `methodology` das questões), nome, descrição, `answerFormats` (tipos de questão que a desenham; captura usa `VOICE`, `PHOTO`, `VIDEO`), orientação ao Claude, situação (`ACTIVE`, `INACTIVE`, `COMING_SOON`), `isSystem`.
  - `trail_templates`: `code`, nome, descrição, `structure` (JSON) e `isActive`.
  - `courses.trail_template_id`: o modelo que o curso segue (opcional).
- **Estrutura do modelo** (`trailStructureSchema` em `packages/content-ingest/src/catalog.ts`):
  - `unitSteps`: etapas de cada unidade, em ordem, cada uma com `kind` (`VIDEO`, `LESSON`, `PRACTICE`, `INTERACTIVE`), `min` (0 = opcional) e `max` (vazio = sem limite);
  - `closingSteps` e `closingTitle`: unidade final com estrutura própria (ex.: a prática geral);
  - `minUnits` e `maxUnits`;
  - `exam`: o curso termina com desafio final;
  - `methodologies`: metodologias permitidas nas práticas desse modelo (vazio = qualquer ativa).
- **Conferência** (`checkAgainstCatalog`, pura e testada): roda na prévia e na correção da importação, com o catálogo vindo do banco. Gera **só avisos**, agrupados por etapa:
  - `trail_template.unknown`, `trail_template.inactive`, `trail_template.mismatch`, `trail_template.methodology`;
  - `methodology.unknown`, `methodology.inactive`, `methodology.coming_soon`, `methodology.type_mismatch`.
- **Regras do catálogo:**
  - metodologia de captura não pode ficar ativa enquanto o app não tiver a captura;
  - metodologia do sistema não é excluída (só editada ou desligada); a criada pelo MASTER só é excluída se nenhuma questão a usa;
  - modelo de trilha só é excluído se nenhum curso o usa (senão, desligue).
- **Claude (MCP):** tools `list_methodologies` (só as ativas, com a orientação) e `list_trail_templates` (só os ativos, com a estrutura). O prompt de importação manda usar o `code` do modelo em `course.trailTemplate` e só metodologias ativas.
- **Rotas REST** em `/api/master/methodologies` e `/api/master/trail-templates` (fora de `/api/master/content`): o token do Claude **não** edita o catálogo (ADR 0007); ele só lê pelo MCP.

## Consequências
- Catálogo inicial (migração `catalogo_metodologias_e_modelos_de_trilha`): as 18 metodologias de prática do `folks-cursos.json` do cliente, as 3 de captura como "em breve" e 3 modelos de exemplo (vídeo e prática em cada unidade; vídeos e prática no fim; só prática).
- Os widgets das telas de aula (chat, flip, reflect…) **não** entram no menu Metodologia: são parte da aula, não da prática.

## Pendências
- Captura por voz, foto e vídeo: quem avalia (gestor, IA ou autoavaliação), onde guardar (S3) e LGPD.
- "Novo curso a partir do modelo" no painel (montar o esqueleto vazio) não entrou nesta etapa.
