# ADR 0007 — Claude conectado à plataforma (MCP) só para o MASTER criar conteúdo

> tags: adr, mcp, claude, conectar claude, conector, oauth, master, criar planeta, cursos, trilhas, conteúdo, tools | status: aceita (decisão do cliente) | data: 2026-11-09

## Contexto
O cliente quer que o **MASTER-FOLKS** abra o Claude, conecte à plataforma e peça pelo chat, por exemplo: "cria para mim o planeta Comunicação, com os cursos, as trilhas e as URLs dos vídeos do Vimeo". Regra do cliente: a conexão é **somente para o MASTER** e **somente para criar e editar planeta, cursos e trilhas**.

## Decisão
**Servidor MCP na própria API** (Streamable HTTP em `/mcp`), com duas formas de autenticação:
1. **OAuth 2.1 (principal): conector customizado do claude.ai** (web e Desktop).
   - A API atua como *authorization server*: metadata em `/.well-known/oauth-authorization-server` e `/.well-known/oauth-protected-resource`, registro dinâmico de cliente, PKCE obrigatório, tela de login e consentimento da plataforma.
   - **Só usuário com `platformRole = MASTER_FOLKS` consegue autorizar.** Qualquer outro perfil recebe "acesso negado" na tela de consentimento.
   - O token tem escopo `content:write` e vida curta, com refresh. O MASTER revoga a conexão pelo painel.
2. **Token pessoal (PAT `fk_pat_...`):** alternativa para Claude Code ou Desktop via config. Também é só para MASTER e com o mesmo escopo.

**Escopo das tools — SÓ conteúdo:**
- Leitura de apoio: `list_categories`, `list_planets`, `get_planet_tree`, `list_interactive_packages`, `vimeo_status`, `list_vimeo_folders`, `list_vimeo_folder_videos`, `get_vimeo_video`.
- Criação e edição: `create_planet_tree`, `add_course_tree`, `add_unit`, `add_lesson`, `add_question`, `set_course_exam`, `update_planet`, `update_course`, `set_lesson_video`, `link_course_videos_from_folder`, `sync_vimeo_metadata`, `publish_content`.
- **Fora do escopo** (não expostos pelo MCP): relatórios e dashboards, empresas, usuários, dados pessoais, financeiro, configurações e exclusão de conteúdo. A tool `platform_overview` da v0 **não** entra na reconstrução.

**Regras de segurança:**
- As tools reutilizam os **mesmos schemas Zod** e services da API REST. Nada de lógica paralela.
- `create_planet_tree` é transacional; o conteúdo nasce `DRAFT`; `publish_content` só depois de o MASTER confirmar no chat.
- Toda chamada é auditada com `via = 'mcp'` e o usuário MASTER que autorizou.
- Revalidação a cada chamada: se o usuário deixou de ser MASTER ou foi desativado, o token deixa de valer.
- **O token do Claude não vale fora do conteúdo (implementado em 2026-11-11 na v0).** O `JwtAuthGuard` só aceita o PAT `fk_pat_` em `/mcp` e `/api/master/content/*`; qualquer outra rota devolve 403, mesmo o dono sendo MASTER. Escopos do token: `content:write` e `content:read` (o `reports:read` antigo foi removido por migração de dados). Teste: `backend/test/e2e/token-claude-so-conteudo.mjs`.

## Alternativas descartadas
- **Só PAT:** não funciona como conector do claude.ai, que exige OAuth.
- **Expor toda a API ao Claude:** risco desnecessário (dados de pessoas e financeiro) e fora do pedido do cliente.

## Consequências
- A fase F3 inclui o authorization server OAuth, que a v0 não tinha.
- O MASTER precisa de uma tela "Conexões com o Claude" (listar e revogar). O front entra na F9; a API, na F3.

## Pendências
- Testar o fluxo completo com um conector real do claude.ai (cadastro do conector com a URL `https://<api>/mcp`).
- **Situação em 2026-11-11 (v0):** o `/mcp` funciona só com o PAT (24 tools de conteúdo; sem token devolve 401, sem `WWW-Authenticate`). Dá para conectar pelo **Claude Code** (`claude mcp add --transport http ... --header "Authorization: Bearer <PAT>"`) e pelo **Claude Desktop** (ponte `mcp-remote` com o cabeçalho). O conector personalizado do claude.ai ainda **não** funciona: falta o servidor OAuth 2.1 e uma URL HTTPS pública. A tela Integração Claude mostra esses passos.
