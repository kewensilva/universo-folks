# Uma pessoa só pode estar em uma empresa (decisão do cliente)

> tags: aprendizado, empresa, vínculo, regra, colaborador, duas empresas | origem: usuario | data: 2026-11-09

## Regra
Decisões do cliente registradas em decisoes-do-cliente.md prevalecem sobre a v0 e o arquitetura.md

## Contexto
A v0 permitia o mesmo usuário em várias empresas por causa do modo B2B/B2C

## O que estava errado
Permitir vínculos ativos em várias empresas

## O que é correto
Garantir no banco (one_company_key única) e na aplicação (409 other_company); oferecer sair da empresa
