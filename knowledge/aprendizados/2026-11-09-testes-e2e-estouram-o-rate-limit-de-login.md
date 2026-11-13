# Testes e2e estouram o rate limit de login

> tags: aprendizado, testes, e2e, rate limit, login | origem: teste | data: 2026-11-09

## Regra
Antes de culpar o código, verifique se o teste não tropeçou em outra proteção (rate limit, validação)

## Contexto
Roteiros e2e que fazem login várias vezes por minuto

## O que estava errado
Logar a cada caso de teste (10/min por IP) e interpretar o 401/429 como bug da regra

## O que é correto
Logar uma vez por perfil e reaproveitar o token; se precisar de mais logins, esperar a janela
