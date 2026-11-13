# ADR 0010 — Pipeline de importação do conteúdo criado no Claude

> tags: adr, importação, importar conteúdo, claude, json, markdown, planetas já criados, staging, idempotência, folks.content/v1 | status: aceita | data: 2026-11-09

## Contexto
O cliente já pediu ao Claude (no chat, sem conector) para criar vários planetas, com cursos e trilhas. O material está em **JSON** e em **texto/Markdown**, com formatos variados: chaves em português ou inglês, aninhamentos diferentes e respostas corretas indicadas de jeitos diferentes. É preciso trazer isso para o banco com segurança, sem duplicar e sem estragar o que já existe (catálogo do protótipo, progresso de alunos).

## Decisão
1. **Núcleo reutilizável:** `packages/content-ingest` (TypeScript puro, testado). Ele é usado hoje pela v0 e será usado pela `apps/api` na reconstrução.
   - **Formato canônico** `folks.content/v1` (Zod + JSON Schema): o contrato único.
   - **Adaptadores:**
     - JSON tolerante, que aceita aliases em português/inglês e resposta correta por índice (base 0/1 detectada no documento), letra, texto, V/F ou marcação;
     - formato do MCP;
     - Markdown do chat (heurístico);
     - extrator de blocos JSON colados no texto (tolera vírgula sobrando e avisa quando o JSON está cortado).
   - **Padrões de negócio:**
     - "Para a vida": FREE, com unidades 1-2 grátis;
     - "Para o trabalho": PREMIUM + certificado;
     - curso sem trilha: "Em breve".
   - **Validação** com caminho exato (`planets[0].courses[1]...`) e severidade: erro bloqueia; aviso, não.
   - **Planejador** (dry-run), com estratégias `upsert` (padrão) e `create_only`:
     - planeta: CREATE, UPDATE, UNCHANGED, SKIP ou BLOCKED (categoria inexistente);
     - curso: CREATE, REPLACE, UNCHANGED (hash igual) ou CONFLICT (tem progresso de aluno ou chave usada em outro planeta).
2. **Área de preparação na v0** (`ContentImport`). Guarda o bruto, o normalizado (editável pelo MASTER), o relatório, o plano e o resultado.
   - Fluxo: receber → prévia → (corrigir) → gravar.
3. **Gravação:**
   - transação **por planeta**: um planeta com falha não derruba os outros (status PARTIAL);
   - trava contra gravação dupla (status APPLYING);
   - o plano é recalculado contra o banco no momento de gravar;
   - I/O com o Vimeo acontece fora da transação.
4. **Idempotência:**
   - hash do conteúdo por curso e por planeta (`null` e ausente são equivalentes);
   - reenviar o mesmo material não muda nada;
   - re-processar o canônico dá o mesmo resultado (teste de ida e volta).
5. **Planeta existente** (ex.: catálogo do protótipo):
   - só os campos presentes são atualizados; visual e cor nunca são apagados;
   - curso "Em breve" com o **mesmo nome** é **preenchido**, mantendo o `code`, em vez de duplicado;
   - curso com progresso de aluno **nunca** é sobrescrito.
6. **Três portas de entrada**, todas pelo mesmo pipeline: REST (`/api/master/content/imports`), upload de arquivos (`.json`, `.md`, `.txt`) e MCP (`preview_content_import`, `fix_content_import`, `apply_content_import`), que exige o OK do usuário antes de gravar.
7. **Prompt de conversão** (`GET /api/master/content/imports/schema`): o MASTER cola na **mesma conversa** do Claude e recebe o JSON canônico. É o caminho mais fiel para conteúdo que está em texto.

## Consequências
- Conteúdo importado **novo** nasce DRAFT (salvo `publish: true`). Curso que **substitui** um existente (REPLACE) mantém a situação que tinha: se estava publicado, a troca vai ao ar na hora. O MCP avisa o Claude disso (confirmado em 2026-11-13 ao recriar o Feedback sobre o exemplo do seed). A importação não busca miniaturas no Vimeo: depois de gravar, rode a sincronização (`POST /master/content/vimeo/sync?courseId=` ou a tool `sync_vimeo_metadata`). Vídeos sem URL ficam pendentes e são ligados depois pela pasta do Vimeo (`link-folder`, que casa pelo título do vídeo).
- Os geradores de exercício (`GENERATED_PRACTICE`) só são válidos se já existirem no app (aviso).
- Material acima de 20 MB precisa ser dividido (um arquivo por planeta).
