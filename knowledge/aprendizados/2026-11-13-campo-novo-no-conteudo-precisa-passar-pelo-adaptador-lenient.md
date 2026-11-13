# Campo novo no conteúdo precisa passar pelo adaptador lenient, não só pelo schema

> tags: aprendizado, importacao, content-ingest, schema, audio | origem: teste | data: 2026-11-13

## Regra
Todo campo novo do folks.content/v1 entra no schema, no adaptador lenient e num teste de ingest que confere que o campo chega ao bundle

## Contexto
Os sons das telas (audioDemos) estavam no schema, mas a importação ainda os descartava

## O que estava errado
Adicionar o campo só em slideSchema; o adaptador lenient remonta cada tela só com os campos conhecidos e o campo some sem erro

## O que é correto
Adicionar o campo no schema E no adapters/lenient.ts (com aliases), e testar a ida e volta com ingest()
