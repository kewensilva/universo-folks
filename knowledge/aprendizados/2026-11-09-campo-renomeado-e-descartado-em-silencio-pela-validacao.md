# Campo renomeado é descartado em silêncio pela validação

> tags: aprendizado, api, validação, whitelist, renomear campo, contrato | origem: revisao | data: 2026-11-09

## Regra
Ao renomear campo de contrato, faça busca global e trate o nome antigo explicitamente

## Contexto
Renomear campo de DTO/schema (ex.: maxUsers -> maxCollaborators)

## O que estava errado
Achar que clientes e testes antigos vão falhar ao enviar o campo antigo

## O que é correto
Com whitelist ligado o campo antigo é descartado sem erro e a operação 'funciona' sem efeito. Buscar todos os usos (código, testes, docs) e atualizar; considerar aceitar o nome antigo temporariamente.
