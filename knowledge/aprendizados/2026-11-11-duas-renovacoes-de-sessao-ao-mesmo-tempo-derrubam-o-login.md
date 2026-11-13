# Duas renovações de sessão ao mesmo tempo derrubam o login

> tags: aprendizado, sessão, refresh, front-end, web, app | origem: teste | data: 2026-11-11

## Regra
Toda renovação de sessão passa por um único ponto com promessa compartilhada; nunca chame o refresh direto de um efeito ou de vários lugares.

## Contexto
Front web (Next) e app (Expo) com refresh token rotativo da API (2026-11-11)

## O que estava errado
Cada montagem/requisição chamava o refresh por conta própria. Com o StrictMode do React (efeito duas vezes) ou chamadas em paralelo, a segunda renovação chegava com o refresh já trocado, a API recusava e o cookie era apagado: a pessoa caía no login ao recarregar.

## O que é correto
Uma renovação por vez na página/app inteiro (promessa compartilhada: refreshSession() na web, renew() no app) e o cliente da API com refresh single-flight.
