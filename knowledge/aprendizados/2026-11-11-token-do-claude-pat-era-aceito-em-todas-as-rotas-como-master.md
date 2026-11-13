# Token do Claude (PAT) era aceito em todas as rotas como MASTER

> tags: aprendizado, seguranca, mcp, pat, auth | origem: teste | data: 2026-11-11

## Regra
Credencial delegada (PAT, chave de integração) tem lista de rotas permitidas no guarda, nunca herda todos os poderes do dono. ADR 0007: o Claude só cria e edita conteúdo.

## Contexto
Teste do painel do MASTER: o token fk_pat_ gerado para o Claude conseguia ler relatórios, pessoas, financeiro e criar Master, porque o JwtAuthGuard só checava se o token era válido.

## O que estava errado
Autenticar o PAT como o MASTER dono, sem restringir rota, e dar a ele o escopo reports:read.

## O que é correto
O JwtAuthGuard só deixa o PAT passar em /mcp e /api/master/content/*; o resto devolve 403. Escopos novos: content:write e content:read; migração de dados removeu reports:read dos tokens antigos. e2e token-claude-so-conteudo.mjs (14/14).
