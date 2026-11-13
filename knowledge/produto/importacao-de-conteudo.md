# Como importar os planetas que o Claude já criou

> tags: importação, importar, conteúdo criado no claude, json, markdown, upload, prévia, gravar, guia do master | ver ADR 0010

## Caminho recomendado (mais fiel)
1. Pegue o prompt de conversão em `GET /api/master/content/imports/schema` (campo `conversionPrompt`).
2. Cole-o na **mesma conversa** do Claude em que os planetas foram criados. Ele devolve um JSON `folks.content/v1` com tudo.
3. Envie esse JSON (ver abaixo), revise a prévia e grave.

## Formato estendido (aceito desde 2026-11-10)
Além do exemplo básico, o importador aceita os campos que o Claude do cliente passou a gerar:
- 6 tipos de questão (`NUMBER`, `ORDER`, `BUILD_SENTENCE`, `MATCH_PAIRS`, `CLASSIFY`, `SIMULATOR`);
- `widget`, `check` e `textParts` nas telas;
- `visual`, `audio`, `timeLimitMs` e `methodology` nas questões;
- `questionsPerRound` e `generators [{methodology, data}]` nas práticas;
- `isFree` e `color` na unidade;
- `FREEMIUM` no planeta;
- `summary` (linha do card) e `badge.title` no curso.

Detalhes em `knowledge/produto/tipos-de-questao-e-widgets.md`.

**Primeira importação real (2026-11-10, banco de dev):**
- Dinheiro, Fotografia, Inglês e Mecânica gravados como rascunho: 4 cursos e 654 questões.
- O curso Feedback ficou em CONFLICT: o curso do catálogo tem progresso e não é sobrescrito. Ele foi arquivado e a trilha nova criada logo depois (ver abaixo).
- Mesmo dia: os 5 cursos e os planetas foram **publicados** no dev pela API do MASTER, com auditoria. Dinheiro, Fotografia, Inglês e Mecânica aparecem como GRÁTIS (unidades 1-2); Feedback aparece como PREMIUM com certificado.

## Planeta a partir de uma pasta do Vimeo (regra do cliente, 2026-11-13)
- Quando o MASTER pede "crie o planeta X" com o link de uma pasta do Vimeo (`vimeo.com/user/.../folder/<id>`):
  - **pasta com subpastas:** a pasta é o **planeta**, cada subpasta é um **curso** (módulo) e cada vídeo vira uma **unidade**, na ordem do número no nome ("Módulo 1…", "Vídeo 1…");
  - pasta só com vídeos: um curso com os vídeos em ordem (ou perguntar como dividir).
- Os nomes no Vimeo costumam ser genéricos: os títulos e as práticas saem da **transcrição** (legendas do Vimeo, `get_vimeo_transcript`), sem inventar conteúdo.
- O planeta guarda a pasta (`vimeoFolder` no JSON → `Planet.vimeoFolderUri`). Ela é a base do quadro **Organizar vídeos**.
- Depois de gravar: `review_planet_videos` (Claude) ou Conteúdo › planeta › Organizar vídeos (MASTER) para conferir e corrigir equívocos.
- Exemplo real: planeta Excel (pasta 30131059, 5 módulos × 5 vídeos).

## Curso em CONFLICT (já tem progresso de alunos)
A importação nunca sobrescreve trilha com progresso. Para trocar:
1. Arquive o curso antigo: `DELETE /api/master/content/courses/{id}`. Com progresso, a rota **arquiva** em vez de apagar, e o arquivamento fica na auditoria.
2. Rode de novo a prévia e grave: o curso arquivado fica fora do casamento (chave, slug e nome), e a trilha nova vira CREATE.

Matrículas, progresso e certificados do curso arquivado ficam intactos. Se a chave ou o slug novo for igual ao do arquivado, a prévia mostra CONFLICT pedindo outra chave e outro slug.

Roteiro de teste: `backend/test/e2e/arquivar-e-recriar-curso.mjs`.

## Formas de enviar (todas fazem a mesma validação)
| Como | Quando usar |
|---|---|
| `POST /api/master/content/imports` com `{ "content": <JSON ou texto> }` | Colar o JSON ou o texto do chat (aceita blocos ```json no meio do texto) |
| `POST /api/master/content/imports/upload` (campo `files`, até 30 arquivos) | Vários arquivos `.json`, `.md` ou `.txt` de uma vez (um registro por arquivo) |
| Claude conectado (MCP): "importe o que você criou nesta conversa" | O próprio Claude envia, mostra a prévia e só grava com o seu OK |

## Ler a prévia
- `stats`: quantos planetas, cursos, unidades, etapas, questões e **vídeos pendentes** (sem URL).
- `issues`:
  - **erros** bloqueiam e apontam o caminho exato (ex.: `planets[0].courses[1].units[0].lessons[2].questions[0]` sem alternativa correta);
  - **avisos** não bloqueiam;
  - `notes` mostra o que foi inferido (tipo de etapa, padrões de plano grátis, base dos índices de resposta).
- `plan`, para cada planeta e curso:
  - CREATE (novo);
  - UPDATE / REPLACE (já existe e mudou);
  - UNCHANGED (igual ao que já está gravado);
  - CONFLICT (curso com progresso de alunos, que não é sobrescrito);
  - BLOCKED (categoria inexistente).

## Corrigir e gravar
- **Corrigir:** baixe `GET .../imports/{id}/normalized`, ajuste e reenvie com `PUT .../imports/{id}/normalized`. A validação e o plano são refeitos.
- **Gravar:** `POST .../imports/{id}/apply` com `{ "publish": false, "onlyValid": false }`.
  - `onlyValid: true` grava os planetas sem erro e deixa os demais para depois (status PARTIAL).
  - `planets: ["slug"]` grava só os planetas escolhidos.
- Tudo nasce **rascunho**. Publique depois, ou use `publish: true`.
- Reenviar o mesmo material é seguro: nada é duplicado.

## Depois de gravar
- Vídeos pendentes: `POST /api/master/content/courses/{id}/vimeo/link-folder` (casa pelo título do vídeo; rode com `dryRun` antes).
- Libere os planetas para as empresas (`/companies/{id}/planets`) e publique.

## Cursos de som (violão, canto)
- Tela de aula com sons: `audioDemos: [{ label, caption?, sequence }]` (notas sintetizadas) ou `[{ label, url }]` (arquivo). A importação valida a sequência (`soundSequenceSchema`) e recusa som sem `sequence` nem `url`.
- Questão com som: `audio` = `{kind:"NOTES", sequence}` | `{kind:"URL", url}` | `{kind:"TTS", lang, text}`. Sem `kind`, o adaptador deduz pelo campo (`sequence` → NOTES, `url` → URL, senão TTS).
- Microfone: `SIMULATOR` com `simulator.id = "mic_pitch"` e `target`/`targets` válidos (erro `simulator.mic_pitch_target` se faltar). Não gera mais o aviso `simulator.rule_pending`.
- `GENERATED_PRACTICE` aceita os geradores de som e microfone (`pitch_tone`, `tune`, `sing`, `sing_steps`, `ear`, `voice`, `guitar` além dos do protótipo).
- O painel e o MCP (`add_question`, `create_planet_tree`, importação de curso) aceitam o mesmo formato completo de questão (ADR 0015).
