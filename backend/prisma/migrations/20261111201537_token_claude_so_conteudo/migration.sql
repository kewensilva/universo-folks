-- token_claude_so_conteudo
-- ADR 0007: tokens do Claude (MCP) só têm permissão de conteúdo. Remove o rótulo reports:read dos tokens já emitidos.
UPDATE "api_tokens" SET "scopes" = array_remove("scopes", 'reports:read') WHERE 'reports:read' = ANY("scopes");
