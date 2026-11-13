---
name: conteudo-catalogo
description: Cria, importa ou altera conteúdo (planetas, cursos, unidades, aulas em telas, práticas do banco ou geradas, desafio final, insígnias) nos formatos aceitos pela API e pelo MCP - árvore do planeta e catálogo do protótipo. Use para seed, importação ou geração de conteúdo com o Claude.
---

# Conteúdo e catálogo

## Formatos aceitos
1. **Árvore do planeta** (REST `POST /api/master/content/import/planet` ou a tool MCP `create_planet_tree`). Tipos de etapa:
   - `LESSON`: `{ content: { slides: [{ heading, text, visualHtml?, audioDemos? }], generators? } }`
   - `VIDEO`: `{ vimeoUrl, videoTitle?, practice?: { questions } }`
   - `PRACTICE`: `{ questions: [{ prompt, options: [{ text, isCorrect }] }] }`
   - `GENERATED_PRACTICE`: `{ generators: ['t1'], questionCount: 8, isReview? }`
   - `INTERACTIVE`: `{ interactivePackageId }`
   - Unidade com `accessTier` (FREE/PREMIUM); curso com `badge`, `icon`, `meta`, `drillLabel`; `exam` com `questionSource` BANK (questions) ou GENERATED (generators).
2. **Catálogo do protótipo** (`content/catalog.json`): `POST /api/master/content/import/catalog` ou o seed. Idempotente; `force` regrava trilhas só de cursos sem progresso.

## Regras
- Conteúdo novo nasce `DRAFT`; publicar só com confirmação do usuário.
- "Para a vida": curso FREE com as unidades 1-2 FREE e o resto PREMIUM, mais insígnia.
- "Para o trabalho": curso PREMIUM, `hasCertificate`, desafio final com questões do **BANCO**.
- Geradores: apenas ids existentes (`generators.ids` do catálogo). Um id novo exige trabalho no app.
- Questões vêm do roteiro ou transcrição do vídeo. Sem material, peça ao usuário.
- Vídeos: depois de criados, ligue-os pela pasta do Vimeo (`link-folder`, primeiro com `dryRun`).
