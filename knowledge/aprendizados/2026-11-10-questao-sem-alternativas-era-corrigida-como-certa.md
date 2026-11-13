# Questão sem alternativas era corrigida como certa

> tags: aprendizado, correção, tipos de questão, prova, prática | origem: teste | data: 2026-11-10

## Regra
Todo tipo de questão novo precisa de correção própria no servidor e de teste com resposta vazia; nunca deduza acerto de dois conjuntos vazios.

## Contexto
Importação do lote real do cliente com questões NUMBER, ORDER, MATCH_PAIRS etc. (2026-11-10)

## O que estava errado
A correção comparava o conjunto de alternativas corretas com o marcado; sem alternativas e sem resposta, os dois conjuntos ficavam vazios e a questão passava como certa.

## O que é correto
Corrigir por tipo com gradeQuestion (packages/content-ingest/src/questions.ts); questão sem resposta ou sem gabarito é erro.
