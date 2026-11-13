# Claude criando planetas, cursos e trilhas (MCP)

O MASTER abre o Claude, conecta à plataforma e pede algo como:

> "Cria para mim o planeta **Comunicação** na categoria Para o trabalho, com os cursos Comunicação Assertiva e Comunicação Não Violenta. Os vídeos estão na pasta *Comunicação* do Vimeo."

O Claude chama as tools do **servidor MCP** da API e o conteúdo é criado direto no banco.

## Como funciona

```
Claude ──MCP (HTTP)──▶ /mcp ──▶ McpServerFactory (tools) ──▶ ContentService ──▶ PostgreSQL
            Authorization: Bearer fk_pat_...           (mesma validação Zod da API REST)
```

- **Autenticação:** token pessoal (PAT) gerado pelo MASTER. Só MASTER-FOLKS consegue usar.
- **Auditoria:** toda ação feita pelo Claude é registrada em `audit_logs` com `via = 'mcp'`.
- **Transação:** `create_planet_tree` cria o planeta inteiro numa única transação. Se algo falhar, nada é gravado.
- **Segurança de publicação:** as instruções do servidor orientam o Claude a criar tudo em `DRAFT` e só publicar depois de você confirmar.

## Passo a passo

1. Gere o token. Ele aparece **uma única vez**; guarde-o.
   ```bash
   curl -X POST http://localhost:3000/api/master/api-tokens \
     -H "Authorization: Bearer <access token do MASTER>" -H "Content-Type: application/json" \
     -d '{"name":"Claude do Kewen"}'
   ```
2. Conecte o Claude.
   - **Claude Code**, servidor remoto:
     ```bash
     claude mcp add --transport http universo-folks https://SEU_DOMINIO/mcp --header "Authorization: Bearer fk_pat_..."
     ```
   - **Claude Desktop** (`claude_desktop_config.json`), via `mcp-remote`:
     ```json
     { "mcpServers": { "universo-folks": {
         "command": "npx",
         "args": ["-y", "mcp-remote", "https://SEU_DOMINIO/mcp", "--header", "Authorization: Bearer fk_pat_..."]
     } } }
     ```
   - **Local (desenvolvimento)**, via stdio direto no banco: `FOLKS_API_TOKEN=fk_pat_... node dist/mcp/mcp-stdio.js`
   - **claude.ai (web):** conectores customizados exigem OAuth 2.1, que ainda não está implementado. Esta é a próxima etapa.
3. Configure `VIMEO_ACCESS_TOKEN` no `.env`. É opcional, mas permite que o Claude liste as pastas e vídeos do Vimeo e preencha a duração automaticamente.

## Tools disponíveis

| Tool | Uso |
|---|---|
| `list_categories`, `list_planets`, `get_planet_tree` | Consultar o que já existe |
| `create_planet_tree` | Criar um planeta completo (cursos, unidades, vídeos + práticas, certificação) |
| `add_course_tree` | Adicionar um curso completo a um planeta existente |
| `add_unit`, `add_lesson`, `add_question`, `set_course_exam` | Ajustes pontuais |
| `update_planet`, `update_course`, `publish_content` | Editar e publicar |
| `vimeo_status`, `list_vimeo_folders`, `list_vimeo_folder_videos`, `get_vimeo_video` | Consultar a conta e as pastas do Vimeo |
| `link_course_videos_from_folder`, `set_lesson_video`, `sync_vimeo_metadata` | Ligar vídeos às lições e manter os metadados atualizados |
| `list_interactive_packages` | Pacotes SCORM/xAPI para lições interativas |
| `platform_overview` | Resumo do dashboard MASTER |

## Formato da árvore (resumo)

```json
{
  "planet": {
    "categorySlug": "para-o-trabalho",
    "name": "Comunicação",
    "status": "DRAFT",
    "accessTier": "PREMIUM",
    "courses": [{
      "title": "Comunicação Assertiva",
      "units": [{
        "title": "O que é assertividade",
        "lessons": [{
          "type": "VIDEO",
          "title": "Introdução",
          "vimeoUrl": "https://vimeo.com/123456789/abcdef",
          "practice": { "questions": [
            { "prompt": "Ser assertivo é...", "options": [
              { "text": "Expressar-se com clareza e respeito", "isCorrect": true },
              { "text": "Impor sua opinião" }
            ] }
          ] }
        }]
      }],
      "exam": { "title": "Certificação", "questions": [ ... ] }
    }]
  }
}
```

O mesmo JSON também pode ser importado sem o Claude, por `POST /api/master/content/import/planet`. O schema completo está em `src/content/content.schemas.ts`.

> **Dica:** para o Claude escrever boas questões de prática e da certificação, envie também o roteiro ou a transcrição de cada vídeo. Ele não "assiste" ao vídeo do Vimeo.
