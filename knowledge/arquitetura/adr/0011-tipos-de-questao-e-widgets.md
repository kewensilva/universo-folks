# ADR 0011 — Tipos de questão além da escolha, widgets de aula e correção no servidor

> tags: adr, tipos de questão, NUMBER, ORDER, BUILD_SENTENCE, MATCH_PAIRS, CLASSIFY, SIMULATOR, widget, metodologia, gerador, correção, prática infinita | status: aceita | data: 2026-11-10

## Contexto
O cliente mandou o primeiro lote real criado no Claude (`folks-content.json`). São 5 planetas, 5 cursos, 22 unidades e 795 questões. O lote segue o `folks.content/v1`, mas acrescenta campos opcionais, documentados pelo cliente no LEIAME:
- 6 tipos de questão que não são de escolha: número, ordenar, montar frase, ligar pares, classificar e simulador;
- widgets interativos nas telas de aula (10 tipos);
- "confere rapidinho" depois de cada tela;
- texto em partes;
- imagens SVG e áudio TTS nas questões;
- tempo por questão;
- metodologia de origem;
- geradores com dados para a prática infinita;
- `isFree` e `color` na unidade, `FREEMIUM` no planeta, `summary` e `badge.title` no curso.

O modelo só tinha questões de escolha (`question_options` com `is_correct`). Pior: a correção antiga considerava **certa** uma questão sem alternativas quando não vinha resposta. Um `NUMBER` gravado no modelo antigo passaria sempre.

## Decisão
1. **Formato canônico estendido** (`packages/content-ingest/src/schema.ts`): a questão é uma união discriminada por `type`:
   - escolha (`SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`) com `options`;
   - `NUMBER` `{answer, tolerance?}`;
   - `ORDER` e `BUILD_SENTENCE` `{pieces, answer}`;
   - `MATCH_PAIRS` `{pairs}`;
   - `CLASSIFY` `{groups, items[{text, group, feedback?}]}`;
   - `SIMULATOR` `{simulator{id,...}, note?}`.

   Campos comuns a todos os tipos: `methodology`, `timeLimitMs`, `visual`, `visualAfterAnswer`, `audio{kind:TTS}` e `speakAfterAnswer`.

   O slide ganha `textParts`, `widget{type,...}` e `check` (uma questão). A prática ganha `questionsPerRound` e `generators[{methodology, data}]`. A unidade ganha `color`, e o curso ganha `meta`.
2. **Banco:** `QuestionType` ganha os 6 tipos, e `questions` ganha as colunas abaixo. A migração `20261110181554_tipos_de_questao_e_widgets` só adiciona.

   | Coluna | O que guarda |
   |---|---|
   | `data` (JSON) | Campos do tipo: resposta, peças, pares, grupos, simulador |
   | `media` (JSON) | Imagens e áudio |
   | `methodology` | Metodologia de origem |
   | `time_limit_ms` | Tempo da questão |

   `lessons.generator_specs` guarda os geradores com dados. Telas, widgets e "confere rapidinho" ficam no JSON `lessons.content.slides`.
3. **Fonte única por tipo** em `packages/content-ingest/src/questions.ts`, usada pelo importador e pela API:
   - `toStorage`: formato canônico → linhas do banco;
   - `publicQuestion`: o que o aluno recebe, **sem resposta**, com peças, pares e itens embaralhados (ordenar nunca chega na ordem certa);
   - `gradeQuestion`: correção no servidor por tipo. Questão sem resposta é erro.
4. **SIMULATOR:** a regra de acerto de cada simulador roda no app, que informa `{simulator:{correct}}`. O servidor aceita e marca `selfReported: true`. A importação avisa (`simulator.rule_pending`).
5. **FREEMIUM:** o planeta fica `FREE` (está no plano grátis) e cada unidade diz se é livre (`isFree` → `accessTier` FREE/PREMIUM). Não foi criado um enum novo: o modelo atual (tier do planeta + tier da unidade) já expressa isso.
6. **Metodologias e widgets conhecidos** ficam em `KNOWN_METHODOLOGIES` e `KNOWN_WIDGETS` (catálogo `formats` do `folks-cursos.json`). Fora da lista, a importação **avisa** ("exige desenvolvimento no app") e não bloqueia.

## Alternativas descartadas
- Uma tabela por tipo de questão: muitas tabelas para estruturas pequenas e que mudam; o JSON tipado e validado pelo Zod resolve.
- Guardar a resposta só no app (como no protótipo): impede corrigir prova e prática do banco no servidor (ADR 0005).
- Enum `FREEMIUM` no `AccessTier`: obrigaria mexer em toda a regra de acesso sem ganho real.

## Consequências
- A resposta do aluno (`AnswerDto`) passa a ter um campo por tipo: `optionIds`, `value`, `sequence`, `pairs`, `assignments` ou `simulator`.
- Prática do banco com `questionsPerRound`: a API sorteia a rodada e corrige só as questões respondidas, que precisam ser pelo menos `questionsPerRound`.
- A prática infinita devolve `generatorSpecs`: o app gera as questões a partir dos dados.
- O "confere rapidinho" das telas é corrigido no app, porque faz parte da aula e não vale nota.

## Pendências
- Programar no servidor a regra de acerto de cada simulador (`saldo`, `juros`, `reserva`, `c_m_mov`...) para tirar o `selfReported`.
- As tools de árvore do MCP (`create_planet_tree`, em `content.schemas.ts`) ainda só aceitam escolha. Por enquanto o Claude envia os tipos novos pela tool de importação (formato canônico).
- O widget `REFLECT` precisa de armazenamento **privado do aluno**, que nunca aparece para o ADM da empresa. Ainda não existe endpoint.
