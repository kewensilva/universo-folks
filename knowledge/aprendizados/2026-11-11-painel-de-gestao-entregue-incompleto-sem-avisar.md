# Painel de gestão entregue incompleto sem avisar

> tags: aprendizado, front-end, escopo, painel, master, empresa | origem: usuario | data: 2026-11-11

## Regra
Quando o pedido é um painel/produto completo, o escopo padrão é cobrir tudo que a API já oferece para aquele perfil; fatia parcial só com acordo explícito e avisada no início.

## Contexto
Início do front-end (2026-11-11): o cliente pediu desde o começo um painel completo de gestão para o MASTER e para o administrador da empresa

## O que estava errado
Entreguei uma fatia vertical (login, perfis e só Visão geral + Empresas no MASTER e Visão geral + Pessoas na empresa) e listei o resto como 'próximas entregas' no fim, quando o pedido era o painel completo.

## O que é correto
Mapear todas as rotas de gestão da API e entregar o menu completo de cada perfil, testado com a API real; se algo ficar de fora, dizer ANTES de começar e pedir a prioridade.
