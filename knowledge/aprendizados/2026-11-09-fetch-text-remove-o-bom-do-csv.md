# fetch().text() remove o BOM do CSV

> tags: aprendizado, testes, csv, bom, fetch | origem: teste | data: 2026-11-09

## Regra
Para validar bytes de arquivo, nunca use APIs que decodificam texto

## Contexto
Teste verificando que o CSV começa com BOM UTF-8 (Excel pt-BR)

## O que estava errado
Checar text.charCodeAt(0) === 0xFEFF depois de response.text() (o decoder remove o BOM)

## O que é correto
Ler bytes crus com arrayBuffer() e checar efbbbf
