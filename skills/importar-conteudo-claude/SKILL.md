---
name: importar-conteudo-claude
description: Importa para o banco planetas, cursos e trilhas que o cliente já criou conversando com o Claude (JSON em qualquer formato ou texto/Markdown do chat), usando o pipeline com prévia, correção e gravação idempotente. Use quando houver conteúdo pronto para trazer à plataforma, ou para evoluir o pacote packages/content-ingest.
---

# Importar conteúdo criado no Claude

Referências: ADR 0010, `knowledge/produto/importacao-de-conteudo.md`, pacote `packages/content-ingest`.

## Para importar material do cliente
1. **Material em texto?** Prefira o prompt de conversão (`GET /api/master/content/imports/schema` → `conversionPrompt`), colado na mesma conversa do Claude.
2. Envie: `POST /api/master/content/imports` (`content` = JSON ou texto) ou `/upload` (arquivos `.json`, `.md`, `.txt`).
3. **Leia a prévia com o usuário:** erros (bloqueiam), avisos (vídeo sem URL, gerador inexistente), o plano (CREATE / UPDATE / REPLACE / UNCHANGED / CONFLICT / BLOCKED) e as `notes` com o que foi inferido.
4. **Corrija** com `PUT .../imports/{id}/normalized` até não haver erros. Para lotes grandes com poucos erros, `onlyValid: true` grava o resto.
5. **Grave só com o OK do usuário:** `POST .../imports/{id}/apply`. Conteúdo nasce DRAFT.
6. **Depois:** ligue os vídeos pela pasta do Vimeo (`link-folder`) e publique.

## Para evoluir o pacote (novo formato / nova variação do Claude)
1. Adicione uma **amostra real** em `packages/content-ingest/test/fixtures/`.
2. Ajuste o adaptador:
   - aliases de chave: `A` em `adapters/lenient.ts`;
   - padrões de texto: regex em `adapters/markdown.ts`.
3. Escreva o teste e rode `npm --prefix packages/content-ingest test`. O teste de **ida e volta** precisa continuar verde (o hash de conteúdo não pode mudar entre passadas).
4. Nunca relaxe a validação de questões: sem alternativa correta é erro.
