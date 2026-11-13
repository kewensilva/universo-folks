# Hook que barra um comando composto não roda nenhuma parte dele

> tags: aprendizado, prisma, migracao, hook | origem: incidente | data: 2026-11-13

## Regra
Conferir que o SQL da migração está completo antes do migrate deploy

## Contexto
Migração: um único comando acrescentava o SQL de dados à migração e conferia o diff lendo o arquivo de segredos

## O que estava errado
Juntar o append do SQL e a leitura do arquivo de segredos no mesmo comando: o hook barrou tudo, a migração foi aplicada sem os dados e não podia mais ser editada

## O que é correto
Acrescentar dados num comando separado, conferir com cat antes do migrate deploy e checar o diff com --from-schema-datasource prisma/schema.prisma; se já aplicou, criar uma migração nova só de dados
